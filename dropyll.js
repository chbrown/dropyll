#!/usr/bin/env node
var fs = require('fs'),
    path = require('path'),
    http = require('http'),
    spawn = require('child_process').spawn,
    dbox = require('dbox'), // node-dropbox has a slightly nicer interface, but is broken
    socket_io = require('socket.io'),
    node_static = require('node-static'),
    argv = require('optimist').argv;

var options = {
  host: argv.host || '127.0.0.1',
  port: argv.port || 8050,
  local: argv.local,
  dropbox: argv.dropbox,
  tld: argv.tld
};

// ('root' defaults to sandbox)
var dropbox = dbox.createClient({app_key: argv.appkey, app_secret: argv.appsecret, root: 'dropbox'});
var oauth = {oauth_token: argv.oauthtoken, oauth_token_secret: argv.oauthsecret};

var metadata_cache = {}; // maps paths to revision numbers
function syncDirectory(dropbox_path, socket, callback) {
  dropbox.metadata(dropbox_path, oauth, function(status, reply) {
    socket.emit('log', "metadata status: " + status);
    var item = JSON.parse(reply);
    if (!path.existsSync(local_path + item.path))
      fs.mkdirSync(local_path + item.path);
    socket.emit('log', 'Got directory contents: ' +
      JSON.stringify(item.contents, null, 4) + '\n\n');
    syncFiles(item.contents, socket, callback);
  });
}

function syncFiles(items, socket, callback) {
  // callback signature: (error, changed_bool)
  var changed = false;
  (function next(err, changed2) {
    if (changed2 === true) changed = true;
    var item = items.pop();
    if (item) {
      if (item.is_dir) {
        syncDirectory(item.path, socket, next);
      }
      else {
        if ((metadata_cache[item.path] || -1) < item.revision) {
          changed = true;
          dropbox.get(item.path, oauth, function(status, file_contents) {
            console.log('dropbox.metadata', status, file_contents);
            socket.emit('log', 'client.get: ' + item.path + ' (' + status + ') > ' +
              options.local + item.path + '\n');
            fs.writeFile(options.local + item.path, file_contents, next);
          });
          metadata_cache[item.path] = item.revision;
        }
        else {
          next();
        }
      }
    }
    else {
      callback(null, changed);
    }
  })(null, false);
}

function jekyll(mode, socket, callback) {
  var local_fullpath = options.local + options.dropbox;
  fs.readdir(local_fullpath, function(err, files) {
    var live = mode === 'live';
    var jekyll = spawn('jekyll', [live ? '_live' : '_test'], {
      cwd: local_fullpath,
      env: process.env
    });
    jekyll.stdout.on('data', function (data) {
      socket.emit('log', 'jekyll >: ' + data + '\n');
    });
    jekyll.stderr.on('data', function (data) {
      socket.emit('log', 'jekyll 2>: ' + data + '\n');
    });
    jekyll.on('exit', function (code) {
      socket.emit('log', 'jekyll FINISHED! ' + code + '\n');
      callback(null);
    });
  });
}

var static_server = new node_static.Server('./static');
var app = http.createServer(function(req, res) {
  console.log('Serving: ' + req.url);
  var m = req.url.match(/^\/dropyll\/static\/(.+)$/);
  if (m) {
    static_server.serveFile(m[1], 200, {}, req, res);
  }
  else {
    res.end('[Dropyll] Bad url: ' + req.url);
  }
}).listen(options.port, options.host, function() {
  console.log(__filename + ' server running at http://' + options.host + ':' + options.port + '/');
});

var io = socket_io.listen(app);
io.sockets.on('connection', function (socket) {
  console.log('Got socket', socket);
  socket.on('render', function (data) {
    var mode = data.mode;
    console.log("Got render event on server-side");
    socket.emit('log', '\nStarting sync...\n\n');
    syncDirectory(options.dropbox, socket, function(err, changed) {
      socket.emit('log', '\n\n*** Done ***\n\nSomething changed: ' + changed + '!\n');
      socket.emit('log', '\nStarting jekyll...\n\n');
      jekyll(mode, socket, function(err) {
        socket.emit('log', '\nEnd!\n');
        socket.emit('refresh', 'http://' + mode + '.' + options.tld);
      });
    });
  });
});
