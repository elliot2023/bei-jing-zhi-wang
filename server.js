// 北北小勇士 联机服务器
// 用法: node server.js [端口号]
// 默认端口: 8888
const http=require('http');const fs=require('fs');const path=require('path');
const WebSocket=require('ws');
const PORT=parseInt(process.env.PORT||process.argv[2])||8888;

// HTTP server - serve game file
const httpServer=http.createServer(function(req,res){
  let url=req.url.split('?')[0];
  let file=url==='/'?'/contra-game.html':url;
  const fp=path.join(__dirname,file);
  const ext=path.extname(fp);
  const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'};
  fs.readFile(fp,function(err,data){
    if(err){console.log('[404]',fp,err.code);res.writeHead(404);res.end('Not found: '+file);return}
    res.writeHead(200,{'Content-Type':(types[ext]||'text/plain')+';charset=utf-8'});res.end(data);
  });
});

// WebSocket server
const wss=new WebSocket.Server({server:httpServer});
const rooms={}; // {id:{name,pass,host:ws,hostName,guest:ws,guestName}}
let nextId=1;

function broadcastRoomList(){
  const list=[];
  for(const id in rooms){const r=rooms[id];
    list.push({id:id,name:r.name,hasPass:!!r.pass,host:r.hostName,playing:r.guest!==null});
  }
  const msg=JSON.stringify({type:'rooms',list:list});
  wss.clients.forEach(function(c){if(c.readyState===WebSocket.OPEN)c.send(msg)});
}

wss.on('connection',function(ws){
  ws.isAlive=true;
  ws.on('pong',function(){ws.isAlive=true});

  // Send room list on connect
  const list=[];
  for(const id in rooms){const r=rooms[id];
    list.push({id:id,name:r.name,hasPass:!!r.pass,host:r.hostName,playing:r.guest!==null});
  }
  ws.send(JSON.stringify({type:'rooms',list:list}));

  ws.on('message',function(raw){
    let msg;try{msg=JSON.parse(raw)}catch(e){return}

    if(msg.type==='create'){
      const id=''+(nextId++);
      rooms[id]={name:msg.name||('房间'+id),pass:msg.pass||'',host:ws,hostName:msg.playerName||'主机',guest:null,guestName:''};
      ws.roomId=id;ws.role='host';
      ws.send(JSON.stringify({type:'created',id:id}));
      broadcastRoomList();
      console.log('Room created: '+id+' by '+msg.playerName);
    }

    else if(msg.type==='join'){
      const r=rooms[msg.id];
      if(!r){ws.send(JSON.stringify({type:'error',msg:'房间不存在'}));return}
      if(r.guest){ws.send(JSON.stringify({type:'error',msg:'房间已满'}));return}
      if(r.pass&&r.pass!==msg.pass){ws.send(JSON.stringify({type:'error',msg:'密码错误'}));return}
      r.guest=ws;r.guestName=msg.playerName||'客人';
      ws.roomId=msg.id;ws.role='guest';
      ws.send(JSON.stringify({type:'joined',hostName:r.hostName}));
      r.host.send(JSON.stringify({type:'guestJoined',guestName:r.guestName}));
      broadcastRoomList();
      console.log(r.guestName+' joined room '+msg.id);
    }

    else if(msg.type==='signal'){
      const r=rooms[ws.roomId];
      if(!r){console.log('[Signal] No room for',ws.role);return}
      const target=ws.role==='host'?r.guest:r.host;
      console.log('[Signal] From',ws.role,'type:',msg.data?msg.data.type:'?','-> target:',target?'found':'none');
      if(target&&target.readyState===WebSocket.OPEN){
        target.send(JSON.stringify({type:'signal',data:msg.data}));
      }
    }

    else if(msg.type==='start'){
      const r=rooms[ws.roomId];
      if(!r||ws.role!=='host'||!r.guest)return;
      r.guest.send(JSON.stringify({type:'gameStart'}));
      r.host.send(JSON.stringify({type:'gameStart'}));
      console.log('Game started in room '+ws.roomId);
    }
  });

  ws.on('close',function(){
    const id=ws.roomId;
    if(!id||!rooms[id])return;
    const r=rooms[id];
    if(ws.role==='host'){
      if(r.guest&&r.guest.readyState===WebSocket.OPEN)r.guest.send(JSON.stringify({type:'hostLeft'}));
      delete rooms[id];
    }else{
      r.guest=null;r.guestName='';
      if(r.host&&r.host.readyState===WebSocket.OPEN)r.host.send(JSON.stringify({type:'guestLeft'}));
    }
    broadcastRoomList();
    console.log('Room '+id+' updated (disconnect)');
  });
});

// Heartbeat
setInterval(function(){wss.clients.forEach(function(ws){
  if(!ws.isAlive)return ws.terminate();ws.isAlive=false;ws.ping()
})},30000);

httpServer.listen(PORT,function(){
  console.log('=== 北北小勇士 联机服务器 ===');
  console.log('游戏地址: http://localhost:'+PORT);
  console.log('局域网地址: http://'+getIP()+':'+PORT);
  console.log('等待玩家连接...');
});

function getIP(){const os=require('os');const ifs=os.networkInterfaces();
  for(const k in ifs){for(const i of ifs[k]){if(i.family==='IPv4'&&!i.internal)return i.address}}return'localhost'}
