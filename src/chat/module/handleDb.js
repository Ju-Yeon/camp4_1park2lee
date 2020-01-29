var rooms = require('../model/room');
var chats = require('../model/chat');

module.exports = {
    readRoom: async (userId, roomId) => {

        var chatList = []
        room_in_db = await rooms.findById(roomId)

        //room_in_db.chat.forEach( async (chatId) => {
        for (var chatId of room_in_db.chat) {
            await chats.findById(chatId)
                .then((chat_in_db) => {
                    var chat_info = {
                        "chatUserName": chat_in_db.speaker,
                        "chatUserId": chat_in_db.speaker,
                        "chatMsg": chat_in_db.originContext,
                    }
                    return chat_info;
                })
                .then((resultChat) => {
                    chatList.push(resultChat)
                });
        }

        var result = {
            "userName": userId,
            "userId": userId,
            "roomName": room_in_db.name,
            "roomId": room_in_db._id,
            "chatList": chatList
        }
        //console.log(result)

        return result;

    },

    saveChat: (content) => {

        var chatModel = new chats();
        chatModel.speaker = content.user;
        chatModel.originContext = content.msg;
        chatModel.room = content.room;
        chatModel.save()
            .then(async function (newChat) {
                console.log(`대화 "${newChat.originContext}" 저장완료`)
                room_in_db = await rooms.findById(newChat.room)
                room_in_db.chat.push(newChat._id)
                room_in_db.save()
                    .then((newRoom) => {
                        console.log(`${newRoom.name}에 대화 저장완료`)
                    })
            })
            .catch((err) => {
                console.log(err)
            })
    }
}