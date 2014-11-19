var Lang;
(function (Lang) {
    'use strict';
    var glob = require('glob'), _ = require('lodash');
    glob('bower_components/angular-i18n/angular-locale_*.js', function (err, files) {
        _.forEach(files, function (file) {
            if (file.indexOf(navigator.language.toLowerCase()) > 0) {
                $('script#lang').attr('src', file);
                return false;
            }
        });
    });
})(Lang || (Lang = {}));
//# sourceMappingURL=lang.js.map