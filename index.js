/**
 * package js and css file via pack rules
 * rebuild file require relationship
 * generate packed file
 */
'use strict';

var gutil = require('gulp-util');
var through = require('through2');
var minimatch = require('minimatch');
var vfs = require('vinyl-fs');
var File = require('vinyl');

var pluginName = 'gulp-her-package';

module.exports = function (ret, opt) {

  opt = opt || {};
  //package
  var pkgConf = her.config.get('pack');

  var pkgMap = {};

  //generate the pkg map
  pkgConf.forEach(function (conf, index) {
    var pid = 'p' + index;
    var globs = conf.src;
    if (her.util.isString(globs)) {
      globs = [globs];
    }
    var fileName = her.util.normalizeRelease(conf.release);
    var cwd = process.cwd() || opt.cwd;
    var vinyl = new File({
      cwd: cwd,
      path: cwd + fileName //temp path,not real
    });
    vinyl.release = '/'; //root path
    var file = her.file(vinyl);

    if (her.util.isArray(globs) && globs.length) {
      pkgMap[pid] = {
        globs: globs,
        file: file,
        pkgs: []
      }
    }
  });

  function match(path, globs) {
    var ret = false;
    for (var i = 0; i < globs.length; i++) {
      var step = her.util.unrelative(process.cwd(), globs[i]);
      if (step[0] === '!') {
        if (minimatch(path, step.slice(1))) {
          ret = false;
          break;
        }
      }
      else if (minimatch(path, step)) {
        ret = i;
      }
    }
    return ret;
  }

  function pack(file) {
    if (file.packed || !(file.isCssLike || file.isJsLike))
      return;
    her.util.map(pkgMap, function (pid, pkg) {
      var index = match(file.src, pkg.globs);
      if (index !== false) {
        file.packed = true;
        file.requires.forEach(function (id) {
          var dep = ret.ids[id];

          pack(dep);
        });
        var stack = pkg.pkgs[index] || [];
        stack.push(file);
        pkg.pkgs[index] = stack;
        return true;
      }
    });
  }

  function writeFile(file, dest) {
    var stream = through.obj();
    stream.write(file);
    stream.pipe(vfs.dest(dest));
  }

  //walk
  her.util.map(ret.ids, function (id, file) {
    pack(file);
  });

  //pack
  her.util.map(pkgMap, function (pid, pkg) {
    var content = '';
    var defines = [];
    var requires = [];
    var requireMap = {};
    var requireAsyncs = [];
    var requireAsyncMap = {};
    var index = 0;


    pkg.pkgs.forEach(function (pkg) {
      pkg.forEach(function (file) {
        var id = file.getId();
        var c = String(file.contents);
        if (c != '') {
          if (index++ > 0) {
            content += '\n';
          }
          content += c;
        }
        requires = requires.concat(file.requires);
        requireMap[id] = true;

        if (file.extras && file.extras.async) {
          requireAsyncs = requireAsyncs.concat(file.extras.async);
          requireAsyncMap[id] = true;
        }

        defines.push(id);

      });
    });
    if (defines.length) {
      pkg.file.contents = new Buffer(content);
      var deps = [];
      requires.forEach(function (id) {
        if (!requireMap[id]) {
          deps.push(id);
          requireMap[id] = true;
        }
      });
      var asyncs = [];
      requireAsyncs.forEach(function (id) {
        if (!requireAsyncMap[id]) {
          asyncs.push(id);
          requireAsyncMap[id] = true;
        }
      });
      var hashId = pkg.file.getHash();
      if (pkg.file.isCssLike) {
        content += "\n" + ".css_" + hashId + "{height:88px}";
        pkg.file.contents = new Buffer(content);
      }

      var dest = her.config.get('dest');
      writeFile(pkg.file, dest);

      var res = ret.map.pkg[hashId] = {
        src: pkg.file.getUrl(),
        type: pkg.file.ext.replace(/^\./, '')
      };

      res.defines = defines;
      res.requires = deps;
      res.requireAsyncs = asyncs;
    }
  });
};
