'use strict';
var Promise = require('bluebird');

var request = require('request');
var gui = require('nw.gui');

var win = gui.Window.get(), fs = Promise.promisifyAll(require('fs'));

var Controllers;
(function (Controllers) {
    var News = (function () {
        function News() {
            this.FeedParser = require('feedparser');
        }
        News.prototype.fetch = function () {
            var _this = this;
            return new Promise(function (resolve, reject) {
                var req = request('https://forum.nemcoin.com/index.php?type=rss;action=.xml'), feedparser = new _this.FeedParser();

                req.on('error', function (error) {
                });

                req.on('response', function (res) {
                    var stream = this;

                    if (res.statusCode !== 200) {
                        return this.emit('error', new Error('Bad status code'));
                    }

                    stream.pipe(feedparser);
                });

                feedparser.on('error', function (error) {
                });

                feedparser.on('readable', function () {
                    var stream = this, items = [], meta = this.meta, item;

                    while (item = stream.read()) {
                        items.push(item);
                    }

                    resolve(items);
                });
            });
        };
        return News;
    })();
    Controllers.News = News;

    var Config = (function () {
        function Config() {
        }
        Config.$inject = [];
        return Config;
    })();
    Controllers.Config = Config;

    var Main = (function () {
        function Main($state) {
            this.$state = $state;
        }
        Main.prototype.clicky = function () {
            alert('click');
            this.$state.go('ncc');
        };
        Main.$inject = ['$state'];
        return Main;
    })();
    Controllers.Main = Main;

    var NCC = (function () {
        function NCC(NEM, $sce) {
            this.url = $sce.trustAsResourceUrl(NEM.config[NEM.config.protocol] + '://' + NEM.config.host + ':' + NEM.config.homePath);
        }
        NCC.$inject = ['NemProperties', '$sce'];
        return NCC;
    })();
    Controllers.NCC = NCC;
})(Controllers || (Controllers = {}));

var Directives;
(function (Directives) {
    var Loading = (function () {
        function Loading() {
            this.template = '<div class="loading_indicator_container"><div class="loading_indicator"><img src="img/loading-bars.svg" /></div></div>';
            this.restrict = 'E';
        }
        Loading.instance = function () {
            var _this = this;
            return [function () {
                    return new _this;
                }];
        };
        return Loading;
    })();
    Directives.Loading = Loading;
})(Directives || (Directives = {}));

var Providers;
(function (Providers) {
    var NemConfig = (function () {
        function NemConfig(data) {
            this.templateUrl = 'templates/nem.properties.mustache';
            this.Hogan = require('hogan.js');
            this.config = {};
            this.template = this.Hogan.compile(this.templateUrl);
            this.set(data);
        }
        NemConfig.prototype.render = function (data) {
            if (typeof data === "undefined") { data = {}; }
            return this.template.render(_.defaults(this.config, data));
        };

        NemConfig.prototype.saveToFile = function (path) {
            return fs.writeFileAsync(path, this.render());
        };

        NemConfig.prototype.set = function (config) {
            if (config) {
                _.merge(this.config, config);
            }
            return this;
        };
        return NemConfig;
    })();
    Providers.NemConfig = NemConfig;

    var NemProperties = (function () {
        function NemProperties() {
            this.config = new NemConfig();
        }
        NemProperties.prototype.$get = function () {
            return this.config;
        };
        return NemProperties;
    })();
    Providers.NemProperties = NemProperties;
})(Providers || (Providers = {}));

var Services;
(function (Services) {
    var Java = (function () {
        function Java() {
        }
        Java.prototype.getUrl = function () {
            var obj;

            if (typeof (obj = Java.javaVersions[process.platform]) === 'object') {
                if (typeof obj[process.arch] === 'string') {
                    return obj[process.arch];
                }
            }

            return false;
        };
        Java.javaUrl = 'http://www.oracle.com/technetwork/java/javase/downloads/jre8-downloads-2133155.html';
        Java.jreRegex = 'https?:\/\/download\.oracle\.com\/otn-pub\/java\/jdk\/[^\/]+?\/jre-[^\-]+?-';
        Java.javaVersions = {
            'darwin': {
                'arm': '',
                'ia32': '',
                'x64': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97361'
            },
            'freebsd': {
                'arm': '',
                'ia32': '',
                'x64': ''
            },
            'linux': {
                'arm': '',
                'ia32': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97358',
                'x64': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97360'
            },
            'sunos': {
                'arm': '',
                'ia32': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97363',
                'x64': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97364'
            },
            'win32': {
                'arm': '',
                'ia32': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=98426',
                'x64': 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=98428'
            }
        };
        return Java;
    })();
    Services.Java = Java;
})(Services || (Services = {}));

angular.module('app', ['ui.router']).service('Java', Services.Java).provider('NemProperties', Providers.NemProperties).config([
    '$stateProvider', '$locationProvider', '$urlRouterProvider', 'NemPropertiesProvider', function ($stateProvider, $locationProvider, $urlRouterProvider, NemPropertiesProvider) {
        NemPropertiesProvider.config.set({});

        $urlRouterProvider.otherwise('/');
        $locationProvider.html5Mode(false);

        $stateProvider.state('main', {
            url: '/',
            controller: Controllers.Main,
            controllerAs: 'main',
            templateUrl: 'templates/main.html'
        });

        $stateProvider.state('config', {
            url: '/config',
            controller: Controllers.Config
        });

        $stateProvider.state('news', {
            url: '/news',
            controller: Controllers.News
        });

        $stateProvider.state('ncc', {
            url: '/ncc',
            template: '<iframe ng-src="{{ncc.url}}" frameBorder="0" nwdisable></iframe>',
            controllerAs: 'ncc',
            controller: Controllers.NCC
        });
    }]).run([function () {
        win.on('close', function () {
            win.hide();
        });

        win.on('new-win-policy', function (frame, url, policy) {
            policy.ignore();
            gui.Shell.openExternal(url);
        });
    }]);
//# sourceMappingURL=boot.js.map
