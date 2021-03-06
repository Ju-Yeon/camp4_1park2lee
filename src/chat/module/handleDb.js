let sequelize = require('sequelize');
let Sequelize = require('../models/index').sequelize;

const Op = sequelize.Op;
let wSocket = require('./socket');

let {room, user, room_chats, room_members, friend} = require('../models');
let chats = require('../model/chat');

let spell = require('./spellCheck');
const rule = require('../data/rank_rule');


function filterMsg(chat) {
    const onlyEng = /^[[A-Za-z0-9~!@#$%^&*()_+|<>?:{}+]*$/;
    let context = chat.origin_context.replace(/ /gi, "");

    let result = true;

    if (chat.origin_context.length < 2) {
        result = false;
    } else if (onlyEng.test(context)) {
        result = false;
    }

    return result;
}

module.exports = {
    /*
    이때 방 정보에서 chat이 있는 방 정보만 가져오는 거로 수정할 것! roomInfo
   */
    readRoom: async (userId, roomId) => {
        console.log('roomid: ', roomId);
        let isP2P = await friend.count({where: {user: userId, room: roomId}});
        let user_in_db = await user.findByPk(userId);
        let room_member_in_db = await room_members.findOne({
            where: {user_id: userId, room_id: roomId}
        });

        if (isP2P > 0 && (typeof room_member_in_db == "undefined" || room_member_in_db == null)) {
            let existRoom = await room.findOne({
                where: {id: roomId}
            });
            await room_members.create({
                room_id: existRoom.id,
                user_id: userId,
                room_name: existRoom.room_name
            }).then(async (new_room_members) => {
                room_member_in_db = await new_room_members;
            }).catch((err) => {
                console.log(err);
            });
        }

        let room_members_in_db = await room_members.findAll({
            where: {room_id: roomId}
        });
        let memberList = [];
        for (let room_member of room_members_in_db) {
            let member_in_user_db = await user.findByPk(room_member.user_id);
            let member_info = {
                "memberId": room_member.user_id,
                "memberName": member_in_user_db.name,
                "memberLatestChatStime": room_member.latest_chat_stime
            };
            memberList.push(member_info);
        }


        let room_chats_in_db = await room_chats.findAll({
            where: {room_id: roomId}
        });
        let chatList = []
        for (let room_chat of room_chats_in_db) {
            await chats.findById(room_chat.chat_id)
                .then(async (chat_in_db) => {
                    let member_in_db = await user.findByPk(chat_in_db.speaker);
                    //console.log(chat_in_db)

                    let chat_info = {
                        "chatUserName": member_in_db.name,
                        "chatUserId": chat_in_db.speaker,
                        "chatStime": chat_in_db.stime,
                        "chatMsg": chat_in_db.origin_context,
                        "chatStatus": chat_in_db.status,
                        "chatCheck": chat_in_db.check_context,
                    }
                    return chat_info;
                })
                .then((resultChat) => {
                    chatList.push(resultChat)
                    //console.log(chatList)
                });
        }

        let result = {
            "userName": user_in_db.name,
            "userId": userId,
            "roomName": room_member_in_db.room_name,
            "roomId": roomId,
            "chatList": chatList,
            "memberList": memberList
        };
        return result;
    },

    saveChat: (content) => {

        let chatModel = new chats();
        chatModel.speaker = content.user;
        chatModel.origin_context = content.msg;
        chatModel.room = content.room;
        chatModel.stime = content.s_time;
        chatModel.save()
            .then(async function (newChat) {
                console.log(`대화 "${newChat.origin_context}" 저장 완료`)

                await room_chats.create({
                    room_id: newChat.room,
                    chat_id: String(newChat._id)
                }).then((new_room_chats) => {
                    console.log("room_chats 저장 완료");

                    if (filterMsg(newChat)) spell.checkSpell(newChat.speaker, newChat._id, new_room_chats.id); //spell 서버 요청
                    else {
                        newChat.status = 1;
                        let reply = JSON.stringify({
                            method: 'message',
                            sendType: 'sendToAllClientsInRoom',
                            content: {
                                method: 'checked msg',
                                s_time: newChat.stime,
                                chatCheck: newChat.origin_context,
                                chatStatus: newChat.status,
                                room: newChat.room
                            }
                        });
                        wSocket.publish(reply);
                        newChat.save();
                    }

                }).catch((err) => {
                    console.log(err, "room_chats 저장 실패")
                });

                room.findOne({
                    where: {id: newChat.room}
                }).then(async (this_room) => {
                    this_room.changed('updated_date', true);
                    await this_room.save()
                }).then(() => {
                    console.log("room updated time update 성공");
                }).catch((err) => {
                    console.log(err, "room updated time update 실패")
                });

            })
            .catch((err) => {
                console.log("대화 저장 실패:", err)
            })
    },
    //유저가 방에서 나갈때 방의 마지막 대화가 유저가 읽은 마지막 대화가 된다.
    updateLatestChat: async (userId, roomId) => {
        try {
            await room_chats.findOne({
                where: {
                    room_id: roomId
                },
                attributes: [[sequelize.fn('max', sequelize.col('id')), 'id']],
            }).then(async (last_room_chat) => { //
                await room_chats.findByPk(last_room_chat.id)
                    .then(async (last_room_chat) => {
                        let last_chat = await chats.findById(last_room_chat.chat_id);
                        await room_members.update({
                            latest_chat_id: last_room_chat.id,
                            latest_chat_stime: last_chat.stime
                        }, {
                            where: {
                                user_id: userId,
                                room_id: roomId
                            }
                        }).then((result) => {
                            console.log("room_members latest_chat 업데이트 완료");
                        }).catch((err) => {
                            console.log("room_members latest_chat 업데이트 실패", err);
                        });
                    })
            });
        } catch {
            console.log("room_members 없음");
            return;
        }
    },
    readRoomList: async (userId) => {

        let result = [];
        let totalUnread = 0;
        let query = `SELECT * FROM room_members JOIN room ON room_members.room_id = room.id WHERE user_id = ${userId} ORDER BY updated_date DESC;`;
        let room_members_in_db = await Sequelize.query(
            query,
            {
                type: Sequelize.QueryTypes.SELECT,
                raw: true
            });

        //console.log(room_members_in_db);

        // let room_members_in_db = await room_members.findAll({
        //     where : { user_id : userId },
        //     include: [
        //         { model: room , as: 'room'}//, required: false }
        //     ],
        //     order: [['room', 'updated_date', 'DESC']]
        // }) -> room과 room_members의 관계가 존재하지 않는다고 나옴!

        for (let room_member of room_members_in_db) {

            let room_other_members = await room_members.findAll({
                where: {room_id: room_member.room_id}
            });
            let latest_chat_id = room_member.latest_chat_id;
            if (latest_chat_id == null) latest_chat_id = 0;
            let query = `SELECT count(*) FROM room_chats WHERE room_id = ${room_member.id} AND id > ${latest_chat_id};`;
            let unread = await Sequelize.query(
                query,
                {
                    type: Sequelize.QueryTypes.SELECT
                });

            let member_list = [];
            for (let member of room_other_members) {
                let member_name = await user.findByPk(member.user_id);
                member_list.push(member_name.name)
            }
            totalUnread += unread[0]['count(*)'];
            await result.push({
                id: room_member.room_id,
                name: room_member.room_name,
                member: member_list,
                unread: unread[0]['count(*)']
            })
        }
        await result.push(totalUnread);

        return result;
    },
    calcUserRank: () => {
        let rankUp = [];
        let rankDown = [];

        Sequelize.query("SELECT * FROM `user` WHERE DATE(latest_access_date) >= DATE_SUB(NOW(), INTERVAL 6 DAY)", {type: Sequelize.QueryTypes.SELECT})
            .then(users => {
                for (let user_in_db of users) {
                    if (user_in_db.score < rule[user_in_db.grade][0] && user_in_db.grade > 2) rankDown.push(user_in_db.id);
                    else if (user_in_db.score > rule[user_in_db.grade][1] && user_in_db.grade < 6) rankUp.push(user_in_db.id);
                }

                if (rankUp.length > 0) {
                    user.update({
                        score: 1000,
                        grade: Sequelize.literal('grade + 1')
                    }, {
                        where: {
                            id: {
                                [Op.in]: rankUp
                            }

                        }
                    })
                }

                if (rankDown.length > 0) {
                    user.update({
                        score: 1000,
                        grade: Sequelize.literal('grade - 1')
                    }, {
                        where: {
                            id: {
                                [Op.in]: rankDown
                            }

                        }
                    })
                }

            })


    }
}
