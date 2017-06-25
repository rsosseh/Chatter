// Server Requires
var http = require('http');
var express = require('express');
var app = express();
var server = http.createServer(app);

//Templating Requires
var engines = require('consolidate');
app.engine('html', engines.hogan);
app.set('views',__dirname + '/templates');
app.set('view engine', 'html');

//Database Requires
var Pool = require('pg-pool');
// pg.defaults.ssl = true;
var db_url = process.env.DATABASE_URL;
// console.log('db: '+db_url)
var pool = new Pool({connectionString:process.env.DATABASE_URL});
// console.log(pool);

pool.on('error', function (err, client) {
  console.error('idle client error', err.message, err.stack);
});

//export the query method for passing queries to the pool
module.exports.query = function (text, values, callback) {
  console.log('query:', text, values);
  return pool.query(text, values, callback);
};

// the pool also supports checking out a client for
// multiple operations, such as a transaction
module.exports.connect = function (callback) {
  return pool.connect(callback);
};


//Static Requires
app.use(express.static('imgs'))

//creating database
var create = 'CREATE TABLE messages (id INTEGER ,room TEXT,nickname TEXT,body TEXT, time INTERGER);';

pool.query(create, function(err,res){
	console.log(res);
	console.log('made table')
})

//creating realtime sockets
var io = require('socket.io').listen(server);


room_size = {}
io.sockets.on('connection', function(socket){

	socket.on('join', function(roomName, nickname, callback){
		socket.join(roomName);
		socket.nickname = nickname;
		socket.roomName = roomName;

		// keep track of #of ppl in rooms to delete empty rooms
		if (room_size[socket.roomName] == undefined) {
			room_size[socket.roomName] = 1;
		}
		else{
			room_size[socket.roomName] += 1;
		}


		var clients_in_room = io.sockets.adapter.rooms[roomName];
		var nicknames = [];
		for (var i = 0; i < clients_in_room.length; i++){
			nicknames[i] = io.sockets.connected[Object.keys(clients_in_room.sockets)[i]].nickname;
		};

		io.sockets.in(roomName).emit('membership_changed',nicknames);
	});

	socket.on('message', function(message, roomName, nickname){
		conn.query('INSERT into messages VALUES ($1, $2, $3, $4, $5)',[0, roomName, nickname, message, 0]);
		io.sockets.in(roomName).emit('message', nickname, message, 0);

	});


	socket.on('disconnect', function(){
		io.sockets.in(socket.roomName).emit('leave', socket.nickname);
		room_size[socket.roomName] -= 1;
		if(room_size[socket.roomName] == 0){
			conn.query("DELETE FROM messages WHERE room= $1",[socket.roomName]);
			conn.query('SELECT DISTINCT room FROM messages',function(err,result){
				for(var i = 0; i < result.rows.length; i++){
					io.sockets.in(result.rows[i].room).emit('refresh', result.rows);
						
				}
			});
		};
	});


});

app.get('/', function(req, res){

	conn.query('SELECT DISTINCT room FROM messages',function(err,result){
		var room_name = generateRoomIdentifier();
		// console.log(result);
		res.render('front_page.html', {rooms: JSON.stringify(result.rows), room_name: room_name})
		// conn.end();
	});

});

app.get('/:roomName', function(req, res){

	conn.query('SELECT DISTINCT room FROM messages',function(err,result){
		res.render('chat_page.html', {rooms: JSON.stringify(result.rows)});
		for(var i = 0; i < result.rows.length; i++){
			io.sockets.in(result.rows[i].room).emit('refresh', result.rows);
				
		}
	});
	
});

server.listen(process.env.PORT || 8080);

function generateRoomIdentifier() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    var result = '';
    for (var i = 0; i < 6; i++)
        result += chars.charAt(Math.floor(Math.random() * chars.length));

    if (conn.query) {};

    return result;
}