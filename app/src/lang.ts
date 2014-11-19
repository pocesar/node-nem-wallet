module Lang {
    'use strict';

    var glob = require('glob'), _ = require('lodash');

    glob('bower_components/angular-i18n/angular-locale_*.js', function(err: Error, files: string[]) {
        _.forEach(files, function(file: string) {
            if (file.indexOf(navigator.language.toLowerCase()) > 0) {
                $('script#lang').attr('src', file);
                return false;
            }
        });
    });
}
