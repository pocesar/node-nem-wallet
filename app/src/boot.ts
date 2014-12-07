import Promise = require('bluebird');
import path = require('path');
import child_process = require('child_process');
import request = require('request');
import gui = require('nw.gui');
import _ = require('lodash');
import semver = require('semver');

module Boot {

'use strict';

var
    win: gui.Window = gui.Window.get(),
    cwd: string = process.execPath.indexOf('node_modules') !== -1 ? process.cwd() : path.join(path.dirname(process.execPath), '.'),
    humanize: any = require('humanize'),
    tar: any = require('tar.gz'),
    fs: any = Promise.promisifyAll(require('graceful-fs'));


interface IJavaResource {
    filename: string;
    url: string;
    batch?: string;
    exec: string;
}

interface IJavaVersion {
    [index: string]: IJavaResource;
    arm: IJavaResource;
    ia32: IJavaResource;
    x64: IJavaResource;
}

interface IJavaVersions {
    [index: string]: IJavaVersion;
}

interface IJavaSemver {
    full: string;
    semver: string;
}

interface INEMConfig {
    [index: string]: any;
    shortServerName?: string;
    folder?: string;
    maxThreads?: number;
    protocol?: string;
    host?: string;
    httpPort?: number;
    httpsPort?: number;
    webContext?: string;
    apiContext?: string;
    homePath?: string;
    useDosFilter?: boolean;
    nis?: boolean;
    bootKey?: string;
    bootName?: string;
    nodeLimit?: number;
    bootWithoutAck?: boolean;
    useBinaryTransport?: boolean;
    useNetworkTime?: boolean;
    unlockedLimit?: number;
    ipDetectionMode?: string;
    nonAuditedApiPaths?: string;
    maxTransactions?: number;
    additionalLocalIps?: string;
    shutdownPath?: string;
}

function templateAsString(filename: string): Promise<string> {
    return fs.readFileAsync(path.join(cwd, 'templates', filename)).then((v: Buffer) => {
        return v.toString();
    });
}

function extract(file: string, path: string): Promise<void> {
    return new Promise<void>((resolve: any, reject: any) => {
        (new tar()).extract(file, path, (err: any) => {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}

module Controllers {

    export class Global {
        static $inject: string[] = ['WalletConfig', 'Log', '$state', 'NEM'];

        pkg: any = require('../package.json');

        shutdown() {
            swal({
                text: 'Do you want to close the program?',
                title: 'Confirm',
                type: 'warning',
                showCancelButton: true,
                closeOnConfirm: true
            }, () => {
                this.WalletConfig.exit();
            });
        }

        loaded() {
            return this.WalletConfig.loaded;
        }

        constructor(private WalletConfig: Providers.WalletConfig, private Log: Services.Log, public $state: ng.ui.IStateService, public NEM: any) {

        }
    }

    export class About {
        static $inject: string[] = ['NemProperties', 'Java'];
        public versions: any;

        constructor(NP: Providers.INemConfigInstance, public java: Services.Java) {
            this.versions = {
                nis: NP.instance('nis').version,
                ncc: NP.instance('ncc').version
            };
        }
    }

    export class Backup {
        static $inject: string[] = [];

        constructor() {

        }
    }

    export class Market {
        static $inject: string[] = ['$scope', 'Log'];
        public usd: any;
        public btc: any;
        public loading: boolean = true;
        public last: any = {
            usd: 0,
            btc: 0
        };
        public current: string = 'btc';
        public config: any = {
            responsive: true,
            scaleBeginAtZero: false,
            pointDot : false,
            showScale: false,
            scaleShowGridLines : true,
            datasetFill: false,
            pointDotStrokeWidth : 0,
            pointHitDetectionRadius : 0
        };


        fetch(): Promise<Object> {
            return new Promise<Object>((resolve: any, reject: any) => {
                var
                    req: request.Request = request.get('http://coinmarketcap.com/static/generated_pages/currencies/datapoints/nemstake-1d.json'),
                    total: string = '';

                req.on('data', (res: any) => {
                    total += res.toString();
                });

                req.on('error', (res: any) => {
                    reject(res);
                });

                req.on('end', (res: any) =>{
                    try {
                        resolve(JSON.parse(total));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
        }


        load() {
            this.$scope.$eval(() => {
                this.loading = true;
            });

            return this.fetch().then((total: any) => {
                this.$scope.$evalAsync(() => {
                    var btc: any = [], usd: any = [], times: any = {usd: [], btc: []}, limit: number = 20;

                    _.forEach(total['price_btc_data'], (item: any, index: number) => {
                        if (index % 2 === 0) {
                            times.btc.push((new Date(item[0])).toLocaleString());
                            btc.push(item[1]);
                        }
                    });

                    _.forEach(total['price_usd_data'], (item: any, index: number) => {
                        if (index % 2 === 0) {
                            times.usd.push((new Date(item[0])).toLocaleString());
                            usd.push(item[1]);
                        }
                    });

                    this.last.usd = _.last(usd);
                    this.last.btc = _.last(btc);

                    this.usd = {
                        labels: times.usd,
                        datasets: [
                            {
                                label: 'BTC',
                                fillColor: 'rgba(220,220,220,0.2)',
                                strokeColor: 'rgba(220,220,220,1)',
                                pointColor: 'rgba(220,220,220,1)',
                                pointStrokeColor: '#fff',
                                pointHighlightFill: '#fff',
                                pointHighlightStroke: 'rgba(220,220,220,1)',
                                data: usd
                            },
                        ]
                    };
                    this.btc = {
                        labels: times.btc,
                        datasets: [
                            {
                                label: 'USD',
                                fillColor: 'rgba(151,187,205,0.2)',
                                strokeColor: 'rgba(151,187,205,1)',
                                pointColor: 'rgba(151,187,205,1)',
                                pointStrokeColor: '#fff',
                                pointHighlightFill: '#fff',
                                pointHighlightStroke: 'rgba(151,187,205,1)',
                                data: btc
                            }
                        ]
                    };

                    this.loading = false;
                });
            }, (err: Error) => {
                this.$scope.$evalAsync(() => {
                    this.Log.add(err.message, 'client');
                    this.loading = false;
                });
            });
        }

        constructor(private $scope: ng.IScope, private Log: Services.Log) {
            this.load();
        }
    }

    interface INewsState {
        url: string;
        loading: boolean;
        data: any[];
        limit: number;
        baseurl: string;
    }

    export class News {
        public FeedParser: any = require('feedparser');
        public states: {[index: string]: INewsState} = {
            'reddit': {
                url: 'http://www.reddit.com/r/nem/.rss',
                baseurl: 'http://www.reddit.com/r/nem',
                loading: true,
                limit: 4,
                data: []
            },
            'forums': {
                url: 'https://forum.nemcoin.com/index.php?type=rss;action=.xml',
                baseurl: 'https://forum.nemcoin.com/index.php',
                loading: true,
                limit: -1,
                data: []
            },
            'medium': {
                url: 'https://medium.com/feed/@xtester',
                baseurl: 'https://medium.com/@xtester',
                loading: true,
                limit: 5,
                data: []
            }
        };
        static $inject: string[] = ['$scope','$sce','Log'];

        loading(type: string, set?: boolean): boolean {
            if (!_.isUndefined(set)) {
                this.states[type].loading = set;
            }
            return this.states[type].loading;
        }

        load(type: string) {
            this.$scope.$eval(() => {
                this.loading(type, true);
            });
            return this.fetch(type).then((av: any) => {
                this.$scope.$evalAsync(() => {
                    this.states[type].data = av;
                    this.loading(type, false);
                });
            }, (err: Error) => {
                this.$scope.$evalAsync(() => {
                    this.loading(type, false);
                    this.Log.add(err.message, 'client');
                });
            });
        }

        fetch(type: string): Promise<any> {
            var state = this.states[type];
            return new Promise<any>((resolve: any, reject: any) => {
                var
                    req: request.Request = request(state.url),
                    feedparser: any = new this.FeedParser(),
                    items: any[] = [];

                req.on('error', (error: any) => {
                    reject(error);
                });

                req.on('response', function (res: any) {
                    var stream: any = this;

                    if (res.statusCode !== 200) {
                        return reject(new Error('Bad status code'));
                    }

                    stream.pipe(feedparser);
                });

                feedparser.on('error', function(error: any) {
                    // always handle errors
                    reject(error);
                });

                feedparser.on('readable', function() {
                    // This is where the action is!
                    var stream: any = this,
                        meta: any = this.meta,
                        item: any;

                    while (item = stream.read()) {
                        items.push(item);
                    }
                });

                feedparser.on('end', function(){
                    var _items: any = {}, limit = 0;

                    var addItem = (item: any) => {
                        _items[item.title] = {
                            title: item.title,
                            url: item.permalink,
                            date: new Date(item.date)
                        };
                    };

                    _.forEach(items, (item: any) => {
                        if (!_items[item.title]) {
                            if (state.limit !== -1) {
                                if (limit < state.limit) {
                                    addItem(item);
                                }
                            } else {
                                addItem(item);
                            }
                        }
                        limit++;
                    });
                    resolve(_items);
                });
            });
        }

        getUrl(item: any) {
            return this.$sce.parseAsUrl(item.url);
        }

        constructor(private $scope: ng.IScope, private $sce: ng.ISCEService, private Log: Services.Log) {
            Promise.reduce(_.keys(this.states), (ac, s) => {
                return this.load(s);
            }, '');
        }
    }

    export class Log {
        static $inject: string[] = ['Log', 'growl','$timeout'];
        public logs: Services.ILog[] = [];
        private _filterBy: string = 'none';
        private saveas: string;
        public labels: any = {
            'none': 'All',
            'ncc': 'NCC',
            'nis': 'NIS',
            'java': 'Java',
            'client': 'Client'
        };

        by(type: string) {
            return this.Log.count(type);
        }

        clear() {
            swal({
                title: 'Confirmation',
                text: 'Are you sure you want to clear ' + this.labels[this._filterBy] + ' logs?',
                showCancelButton: true
            }, () => {
                this.$timeout(() => {
                    if (this._filterBy !== 'none') {
                        this.Log.logs[this._filterBy].length = 0;
                    } else {
                        _.forEach(this.Log.logs, (logs) => {
                            logs.length = 0;
                        });
                    }
                });
            });
        }

        filterBy(type: string) {
            switch (type) {
                case 'none':
                case 'ncc':
                case 'nis':
                case 'java':
                case 'client':
                    this._filterBy = type;
                    break;
            }
        }

        openSaveAs() {
            var dialog: JQuery = $('#fileDialog');
            dialog.one('change', () => {
                var diag: any = dialog[0];
                if (diag.files && diag.files[0] && diag.files[0].path) {
                    var logs: string[] = _.map(this.logs, (m: Services.ILog) => {
                        return (new Date(m.time).toLocaleString()) + ': ' + m.msg;
                    });
                    fs.writeFileAsync(diag.files[0].path, logs.join('\n')).then(() => {
                        this.growl.success(this.Log.add('File saved to ' + diag.files[0].path, 'client'), {ttl: 3000});
                    });
                }
                diag.files.length = 0;
            });
            dialog.click();
        }


        filter() {
            this.logs.length = 0;

            if (this._filterBy === 'none') {
                _.forEach(this.Log.logs, (logs) => {
                    _.forEach(logs, (log) => {
                        this.logs.push(log);
                    });
                });
            } else if (typeof this.Log.logs[this._filterBy] !== 'undefined') {
                _.forEach(this.Log.logs[this._filterBy], (log) => {
                    this.logs.push(log);
                });
            }

            this.logs.sort((a: Services.ILog, b: Services.ILog): number => {
                return a.time - b.time;
            });

            return this.logs;
        }

        constructor(private Log: Services.Log, private growl: any, private $timeout: ng.ITimeoutService){  }
    }

    export class Config {
        static $inject: string[] = ['WalletConfig'];
        private model: any = {};

        save() {
            var config: any = this.WalletConfig;
            _.forEach<string>(['tray','beta','testnet','folder'], (key: string) => {
                config[key] = this.model[key];
            });
            config.save();
        }

        constructor(private WalletConfig: Providers.WalletConfig){
            this.model.tray = WalletConfig.tray;
            this.model.beta = WalletConfig.beta;
            this.model.testnet = WalletConfig.testnet;
            this.model.folder = WalletConfig.folder;
        }
    }

    export class Main {
        static $inject: string[] = ['$state'];

        constructor(private $state: ng.ui.IStateService) {}
    }

    export class NCC {

        static $inject: string[] = ['NemProperties', '$sce'];
        public url: any;

        constructor(NEM: Providers.INemConfigInstance, $sce: ng.ISCEService) {
            var config: Providers.NemConfig = NEM.instance('ncc');
            this.url = $sce.trustAsResourceUrl(config.url('homePath'));
        }
    }

}

module Directives {

    export class ProgressBar implements ng.IDirective {
        public restrict: string = 'A';
        public scope: any = {};
        public link: ng.IDirectiveLinkFn;
        public template = [
            '<div class="progress-bar-wrapper shadow-z-2" ng-show="info()">',
                '<div>Downloading...</div>',
                '<div ng-click="cancel()" class="progress-cancel"><i class="mdi-navigation-cancel"></i></div>',
                '<div class="clearfix">',
                    '<div class="progress progress-striped active">',
                        '<div class="progress-bar" ng-style="{width: info().progress + \'%\'}"></div>',
                    '</div>',
                '</div>',
                '<div class="progress-bar-label">{{ info().label }} from {{ info().url }}</div>',
            '</div>'
        ].join('');

        constructor(Downloads: Services.Downloads) {
            this.link = (scope) => {
                scope['info'] = () => {
                    return Downloads.current();
                };

                scope['cancel'] = () => {
                    var current: Services.IDownloadInfo;

                    if ((current = scope['info']())) {
                        swal({
                            text: 'Cancel the download?',
                            title: 'Confirm',
                            type: 'warning',
                            showCancelButton: true
                        }, () => {
                            current.cancel = true;
                        });
                    }
                };

            };
        }

        static instance() {
            return ['Downloads', (Downloads: any) => new this(Downloads)];
        }
    }

    export class ServerLog implements ng.IDirective {
        public restrict: string = 'E';
        public scope: any = {};
        public template: string = '<div class="well">{{ item.msg }}</div>';
        public link: ng.IDirectiveLinkFn;

        constructor(private Log: Services.Log) {
            this.link = (scope: ng.IScope) => {
                scope.$watch(() => {
                    return Log.last();
                }, (item: Services.ILog) => {
                    if (item && item.group !== 'nis') {
                        scope['item'] = item;
                    }
                }, true);
            };
        }

        static instance(){
            return ['Log', (Log: Services.Log) => new this(Log)];
        }
    }

    export class Loading implements ng.IDirective {
        public template: string = '<div class="loading_indicator_container"><div class="loading_indicator"><div class="loading"></div></div></div>';
        public restrict: string = 'E';

        constructor() {

        }

        static instance(){
            return [() => new this];
        }

    }

}

module Providers {

    export class WalletConfig {
        tray: boolean = false;
        beta: boolean = true;
        testnet: boolean = false;
        folder: string = path.join(cwd, 'nem');
        loaded: boolean = false;
        updating: boolean = false;
        exitCallback: Function = angular.noop;

        _internalState(name: string) {
            return !_.contains(['loaded','updating'], name);
        }

        save() {
            var self: any = this;
            localStorage.setItem('wallet', JSON.stringify(_.filter(self, this._internalState, this)));
            return this;
        }

        exit() {
            this.exitCallback();
        }

        load() {
            var cnf: any = this;
            try {
                var
                    obj: any = JSON.parse(localStorage.getItem('wallet'));

                _.forEach<any>(obj, (value: any, key: string) => {
                    if (_.has(cnf, key) && !_.isFunction(cnf[key]) && this._internalState(key)) {
                        cnf[key] = value;
                    }
                });
            } catch (e) {
                localStorage.setItem('wallet', JSON.stringify(this));
            }
            return this;
        }

        $get() {
            return this;
        }
    }

    export interface INemConfigInstance {
        killAll(): Promise<boolean>;
        instance(instanceName: string): NemConfig;
    }

    export class NemConfig {
        public Hogan: any = require('hogan.js');
        public template: any = this.Hogan.compile(templateAsString('nem.properties.mustache'));
        public config: INEMConfig = {};
        public Log: Services.Log;
        public NEM: any;
        public Java: Services.Java;
        public Download: Services.Downloader;
        public version: string = '';
        private child: child_process.ChildProcess;

        path(more: string[] = []) {
            return path.join.apply(path, [this.config.folder, 'package', this.name].concat(more));
        }

        render(data: INEMConfig = {}): string {
            return this.template.render(_.defaults(this.config, data));
        }

        saveToFile(): Promise<boolean> {
            return fs.writeFileAsync(this.path(['config.properties']), this.render());
        }

        set(config?: INEMConfig): NemConfig {
            if (config) {
                _.merge(this.config, config);
            }
            return this;
        }

        url(append: string[]): string;
        url(append: string): string;
        url(append: any = ''): string {
            if (_.isArray(append)) {
                append = _.map<string, string>(append, (a) => {
                    return this.config[a];
                }).filter((a: any) => a).join('/');
            } else if (this.config[append]) {
                append = this.config[append];
            } else {
                append = '';
            }

            return this.config.protocol + '://' +
                   this.config.host + ':' +
                   this.config[this.config.protocol + 'Port'] +
                   append;
        }

        kill(signal: string = 'SIGTERM'): Promise<boolean> {
            return new Promise<boolean>((resolve: any, reject: any) => {
                if (this.child) {
                    request.get(this.url(['apiContext', 'shutdownPath']), {
                        timeout: 10
                    }, () => {
                        this.Log.add('Process exited', this.name);
                        resolve(true);
                    }).on('error', () => {
                        this.Log.add('Process didn\'t stop in time, killing', this.name);
                        this.child.kill(signal);
                        resolve(false);
                    });
                } else {
                    resolve(true);
                }
            });
        }

        ensurePath(): Promise<any> {
            return new Promise<any>((resolve: any, reject: any) => {
                var mkdirp: any = require('mkdirp');

                mkdirp(this.config.folder, function (err: Error) {
                    if (err) {
                        return reject(err);
                    }
                    resolve();
                });
            });
        }

        download(): Promise<any> {
            return new Promise((resolve: any, reject: any) => {
                this.ensurePath().then(() => {
                    fs.statAsync(this.path()).then((stat: any) =>{
                        resolve();
                    }).catch(() => {
                        var
                            filename = 'nis-ncc-' + this.NEM.version + '.tgz',
                            filePath = path.join(cwd, 'temp', filename);

                        fs.statAsync(filePath).catch(() => {
                            return this.Download.get({
                                url: 'http://bob.nem.ninja/' + filename,
                                filename: filePath,
                                label: filename
                            });
                        })
                        .then(() => {
                            this.Log.add('NEM is downloaded, extracting...', 'client');

                            extract(filePath, this.config.folder).then(() => {
                                this.Log.add('NEM extracted', 'client');
                                resolve();
                            }, reject);

                        }, reject);
                    });
                }, reject);
            });
        }

        run(): Promise<any> {
            return new Promise((resolve: any, reject: any) => {
                this.child = this.Java.exec(['-Xms512M', '-Xmx1G', '-cp', '.;./*;../libs/*', 'org.nem.core.deploy.CommonStarter'], {
                    cwd: this.path(),
                    env: process.env,
                    detached: true
                });

                this.Log.add('Starting ' + this.config.shortServerName, 'client');

                var addFiltered: Function = (str: string) => {
                    if (!/(exiting|entering|Mapped|INDIRECT)/.test(str) || /(WARNING|ERROR|FATAL|SEVERE)/.test(str)) {
                        this.Log.add(str, this.name);
                    }
                };

                this.child.stderr.on('data', (data: Buffer) => {
                    if (!data.length) {
                        return;
                    }
                    var str: string = data.toString();
                    addFiltered(str);
                    if (!this.version){
                        var matches: string[];
                        if ((matches = str.match(/version <([^\>]+?)>/)) && matches[1]) {
                            this.version = matches[1];
                        }
                    }
                    if (str.indexOf('ready to serve') > 0) {
                        resolve(this.version);
                    }
                });

                this.child.stdout.on('data', (data: Buffer) => {
                    addFiltered(data.toString());
                });

                this.child.on('close', (errCode: number) => {
                    if (errCode !== 0) {
                        var msg: string = this.config.shortServerName + ' closed unexpectedly';
                        this.Log.add(msg, this.name);
                    }
                });

                this.child.on('error', (err: any) => {
                    if (err['code'] !== 'ENOENT') {
                        this.Log.add(err.message, this.name);
                    }
                    reject(err);
                });
            });
        }

        constructor(private name: string, data: INEMConfig = null) {
            this.set(data);
        }
    }


    export class NemProperties {
        private instances: _.Dictionary<NemConfig> = {};
        public $get: any[];

        instance(name: string, data: INEMConfig = {}) {
            if (this.instances[name]) {
                return this.instances[name];
            } else {
                return this.instances[name] = new NemConfig(name, data);
            }
        }

        constructor() {
            this.$get = ['Log', 'NEM', 'Downloader', 'Java', (Log: Services.Log, NEM: any, Download: any, Java: any): INemConfigInstance => {
                return {
                    instance: (instance: string) => {
                        this.instances[instance].Log = Log;
                        this.instances[instance].NEM = NEM;
                        this.instances[instance].Download = Download;
                        this.instances[instance].Java = Java;
                        return this.instances[instance];
                    },
                    killAll: (): Promise<boolean> => {
                        return Promise.reduce(_.keys(this.instances), (total: boolean, instance: string) => {
                            return this.instances[instance].kill();
                        }, false);
                    }
                };
            }];
        }
    }
}

module Services {

    export interface IDownloadInfo {
        filename?: string;
        label?: string;
        url?: string;
        size?: number;
        progress?: number;
        cancel?: boolean;
    };

    export interface IDownloaderConfig extends Object {
        filename: string;
        url: string;
        label: string;
    };

    export class Downloads {
        private queue: IDownloadInfo[] = [];

        add(info: IDownloadInfo) {
            this.queue.push(info);
        }

        remove(info: IDownloadInfo) {
            var index: number;
            if ((index = this.queue.indexOf(info)) !== -1) {
                this.queue.splice(index, 1);
            }
        }

        current() {
            return this.queue[0];
        }

    }

    export class Downloader {
        static $inject: string[] = ['$rootScope', 'Downloads', 'Log'];

        get(config: IDownloaderConfig): Promise<void> {
            var info: IDownloadInfo = {
                filename: config.filename,
                url: config.url,
                progress: 0,
                label: config.label,
                cancel: false
            };

            var started = false;

            return new Promise<void>((resolve: any, reject: any) => {
                var
                    progress = require('request-progress'),
                    fileStream = fs.createWriteStream(config.filename),
                    req = request.get(config.url);

                progress(req)
                .on('progress', (state: any) => {
                    if (!started) {
                        started = true;
                        this.Log.add('Starting download for ' + info.label + ' (' + humanize.filesize(state.total) + ')', 'client');
                        this.Downloads.add(info);
                    }
                    this.$rootScope.$applyAsync(() => {
                        if (info.cancel) {
                            req.abort();
                        } else {
                            info.progress = state.percent;
                            info.size = state.total;
                        }
                    });
                })
                .on('error', (error: Error) => {
                    this.$rootScope.$applyAsync(() => {
                        this.Downloads.remove(info);
                        reject(error);
                    });
                })
                .pipe(fileStream)
                .on('error', (error: Error) => {
                    this.$rootScope.$applyAsync(() => {
                        this.Downloads.remove(info);
                        reject(error);
                    });
                })
                .on('close', () => {
                    this.$rootScope.$applyAsync(() => {
                        if (info.cancel) {
                            reject(new Error(this.Log.add('Download canceled for ' + info.label, 'client')));
                        } else {
                            this.Log.add('File ' + info.label + ' downloaded to ' + info.filename, 'client');
                            resolve();
                        }
                        this.Downloads.remove(info);
                    });
                });
            });
        }

        constructor(private $rootScope: ng.IRootScopeService,
                    private Downloads: Downloads,
                    private Log: Log) {}
    }

    export interface ILog {
        time: number;
        msg: string;
        group: string;
    }

    export class Log {
        public $inject: string[] = ['$timeout'];
        public logs: {[index: string]: ILog[]} = {};

        last() {
            var lasts: Services.ILog[] = _.map(this.logs, (logs: Services.ILog[]): Services.ILog => {
                return _.first(logs);
            });

            lasts.sort((a, b) => {
                return a.time - b.time;
            });

            return _.last(lasts);
        }

        count(type: string = 'none'): number {
            if (type && typeof this.logs[type] !== 'undefined') {
                return this.logs[type].length;
            }
            if (type === 'none') {
                return _.reduce(this.logs, (remainder: number, logs: ILog[]): number => {
                    return logs.length + remainder;
                }, 0);
            }
            return 0;
        }

        add(msg: string, group: string = 'global'): string {
            if (typeof this.logs[group] === 'undefined') {
                this.logs[group] = [];
            }

            this.$timeout(() => {
                this.logs[group].unshift({time: Date.now(), msg: msg, group: group});
            }, 0);

            return msg;
        }

        limit(limit: number = 20, start: number = 0, group: string = 'global') {
            if (typeof this.logs[group] === 'undefined') {
                return [];
            }
            return this.logs[group].slice(start, limit);
        }

        constructor(private $timeout: ng.ITimeoutService) {

        }
    }

    export class Java {
        static $inject = ['Log','Downloader'];
        static javaUrl: string = 'http://www.oracle.com/technetwork/java/javase/downloads/jre8-downloads-2133155.html';
        static jreRegex: string = 'https?:\/\/download\.oracle\.com\/otn-pub\/java\/jdk\/[^\/]+?\/jre-[^\-]+?-';
        static versionRegex: RegExp = /java version "(([\.\d]+)[^"]+)"/;
        public latest: string = '?';
        public version: IJavaSemver = {
            semver: '?',
            full: '?'
        };

        static javaVersions: IJavaVersions = {
            'darwin': {
                'arm': {
                    url: '',
                    filename: '',
                    exec: ''
                },
                'ia32': {
                    url: '',
                    filename: '',
                    exec: ''
                },
                'x64': {
                    url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97361',
                    filename: 'jre.dmg',
                    batch: 'install-java.sh',
                    exec: 'java'
                }
            },
            'freebsd': {
                'arm': {
                    url: '',
                    filename: '',
                    exec: ''
                },
                'ia32': {
                    url: '',
                    filename: '',
                    exec: ''
                },
                'x64': {
                    url: '',
                    filename: '',
                    exec: ''
                }
            },
            'linux': {
                'arm': {
                    url: '',
                    filename: '',
                    exec: ''
                },
                'ia32': {
                    url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97358',
                    filename: 'jre.tar.gz',
                    batch: 'install-java.sh',
                    exec: 'java'
                },
                'x64': {
                    url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97360',
                    filename: 'jre.tar.gz',
                    batch: 'install-java.sh',
                    exec: 'java'
                }
            },
            'sunos': {
                'arm': {
                    url: '',
                    filename: '',
                    exec: ''
                },
                'ia32': {
                    url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97363',
                    filename: 'jre.tar.gz',
                    batch: 'install-java.sh',
                    exec: ''
                },
                'x64': {
                    url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=97364',
                    filename: 'jre.tar.gz',
                    batch: 'install-java.sh',
                    exec: ''
                }
            },
            'win32': {
                'arm': {
                    url: '',
                    filename: '',
                    exec: ''
                },
                'ia32': {
                    url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=98426',
                    filename: 'jre.exe',
                    batch: 'install-java.cmd',
                    exec: 'java.exe'
                },
                'x64': {
                    url: 'http://javadl.sun.com/webapps/download/AutoDL?BundleId=98428',
                    filename: 'jre.exe',
                    batch: 'install-java.cmd',
                    exec: 'java.exe'
                }
            }
        };
        public javaBin: string = 'java';
        public jrePath: string = path.join(cwd, 'jre');

        exec(command: string[] = [], options: any = {}) {
            return child_process.spawn(this.javaBin, command, _.defaults({
                env: process.env
            }, options));
        }

        downloadAndInstall(): Promise<any> {
            return new Promise<any>((resolve: any, reject: any) => {
                var url: IJavaResource;
                if (!(url = this.getUrl())) {
                    return reject(new Error('Could not find suitable OS'));
                }

                this.Log.add('Beginning Java download', 'java');

                var
                    filename = path.join(cwd, 'temp', url.filename);

                this
                .Downloader
                .get({
                    label: url.filename,
                    filename: filename,
                    url: url.url
                })
                .then(() => {
                    var
                        batch: string = path.join(cwd, 'temp', url.batch);

                    fs.writeFileAsync(batch, [filename, '/s', 'WEB_JAVA=0', 'INSTALLDIR="' + this.jrePath + '"', '/L java.log'].join(' ')).then(() => {
                        try {
                            var e: any = child_process['execFile'];
                            var child: child_process.ChildProcess = e(batch, {
                                env: process.env
                            });

                            child.on('error', (err: any) => {
                                throw err;
                            });

                            child.on('exit', () => {
                                this.version.semver = this.latest.split('_')[0];
                                this.version.full = this.latest;
                                this.javaBin = path.join(this.jrePath, 'bin', 'java');
                                resolve();
                            });
                        } catch (e) {
                            reject(new Error('Java couldn\'t be installed automatically, execute the file "install-java" in the temp directory'));
                        }
                    }, reject);
                }, reject);
            });
        }

        getUrl(): IJavaResource {
            var obj: IJavaVersion;

            if (typeof (obj = Java.javaVersions[process.platform]) === 'object'){
                if (typeof obj[process.arch] !== 'undefined' && obj[process.arch].url && obj[process.arch].filename) {
                    return obj[process.arch];
                }
            }

            return null;
        }

        private _parseVersion(version: string) {
            var
                versions = version.split('_'),
                _vs = versions[0].split('.');

            return {
                major: _vs[0],
                minor: _vs[1],
                patch: _vs[2],
                revision: versions[1]
            };
        }

        decide(): Promise<any> {
            return new Promise<any>((resolve: any, reject: any) => {
                request.get('http://java.com/applet/JreCurrentVersion2.txt', (err: Error, response: any, version: string) => {
                    if (err) {
                        this.Log.add('Couldn\'t fetch latest version', 'java');
                        return reject(err);
                    }

                    this.Log.add('Latest Java version ' + version, 'java');
                    this.latest = version;

                    var
                        latest: string = this.latest.split('_')[0],
                        revision: number = parseInt(this.latest.split('_')[1]),
                        child: child_process.ChildProcess = this.exec(['-version']);

                    child.on('error', (err: any) => {
                        if (err['code'] === 'ENOENT') {
                            this.Log.add('Java 8 not installed locally', 'java');
                        } else {
                            this.Log.add(err.message, 'java');
                        }

                        this.downloadAndInstall().then(() => {
                            this.Log.add('Java downloaded and installed', 'java');
                            resolve();
                        }, () => {
                            this.Log.add('Failed to download Java, install manually on ' + Services.Java.javaUrl, 'java');
                            reject();
                        });
                    });

                    var gotFirstLine: boolean = false;

                    child.stderr.on('data', (result: Buffer) => {
                        if (gotFirstLine) {
                            return;
                        }
                        var
                            version = result.toString().match(Java.versionRegex),
                            localrevision: number;

                        if (version && typeof version[2] === 'string') {
                            gotFirstLine = true;
                            try {
                                this.version.semver = version[2];
                                this.version.full = version[1];
                                localrevision = parseInt(version[1].split('_')[1]);

                                if (semver.gte(version[2], latest, true) && localrevision >= revision) {
                                    resolve();
                                } else {
                                    reject(new Error(this.Log.add('Java is outdated', 'java')));
                                }
                            } catch (e) {
                                reject(new Error(this.Log.add('Could not determine Java version, install manually from ' + this.getUrl().url, 'java')));
                            }
                        } else {
                            reject(new Error(this.Log.add('No Java version found', 'java')));
                        }
                    });

                });
            });
        }

        constructor(public Log: Services.Log, private Downloader: Services.Downloader){
            var exec: string = this.getUrl().exec;
            fs.statAsync(path.join(this.jrePath, 'bin', exec)).then(() => {
                this.javaBin = path.join(this.jrePath, 'bin', exec);
            }, () => {
                this.javaBin = exec;
            });
        }
    }

}

angular
.module('app', [
    'ngAnimate',
    'ui.router',
    'ngSanitize',
    'tc.chartjs',
    'ngLocale',
    'angularUtils.directives.dirPagination',
    'ct.ui.router.extras',
    'angular-growl'
])
.value('NEM', {
    version: '0.0.0',
    beta: false
})
.controller('Global', Controllers.Global)
.provider('WalletConfig', Providers.WalletConfig)
.service('Java', Services.Java)
.service('Log', Services.Log)
.service('Downloads', Services.Downloads)
.service('Downloader', Services.Downloader)
.directive('serverLog', Directives.ServerLog.instance())
.directive('progressBar', Directives.ProgressBar.instance())
.provider('NemProperties', Providers.NemProperties)
.directive('loading', Directives.Loading.instance())
.config(['$stateProvider',
         '$locationProvider',
         '$urlRouterProvider',
         'NemPropertiesProvider',
         'WalletConfigProvider',
         'growlProvider',
    (
        $stateProvider: ng.ui.IStateProvider,
        $locationProvider: ng.ILocationProvider,
        $urlRouterProvider: ng.ui.IUrlRouterProvider,
        NemPropertiesProvider: Providers.NemProperties,
        WalletConfig: Providers.WalletConfig,
        growlProvider: any
    ) => {

    growlProvider.globalPosition('bottom-right');

    WalletConfig.load();

    NemPropertiesProvider.instance('nis',{
        nis: true,
        folder: WalletConfig.folder,
        shortServerName: 'Nis',
        maxThreads: 500,
        protocol: 'http',
        host: '127.0.0.1',
        httpPort: 7890,
        httpsPort: 7891,
        useDosFilter: true,
        nodeLimit: 20,
        webContext: '',
        apiContext: '',
        bootWithoutAck: false,
        useBinaryTransport: true,
        useNetworkTime: true,
        ipDetectionMode: 'AutoRequired',
        nonAuditedApiPaths: '/heartbeat|/status|/chain/height',
        maxTransactions: 10000,
        additionalLocalIps: '',
        shutdownPath: '/shutdown'
    });

    NemPropertiesProvider.instance('ncc', {
        shortServerName: 'Ncc',
        folder: WalletConfig.folder,
        maxThreads: 50,
        protocol: 'http',
        host: '127.0.0.1',
        httpPort: 8989,
        httpsPort: 9090,
        webContext: '/ncc/web',
        apiContext: '/ncc/api',
        homePath: '/index.html',
        shutdownPath: '/shutdown',
        useDosFilter: false
    });

    $urlRouterProvider.otherwise('/');
    $locationProvider.html5Mode(false);

    $stateProvider.state('main', {
        url: '/',
        controller: Controllers.Main,
        controllerAs: 'main',
        template: templateAsString('main.html')
    });

    $stateProvider.state('config', {
        url: '/config',
        controller: Controllers.Config,
        controllerAs: 'config',
        template: templateAsString('config.html')
    });

    $stateProvider.state('log', {
        url: '/log',
        controller: Controllers.Log,
        controllerAs: 'log',
        template: templateAsString('log.html')
    });

    $stateProvider.state('news', {
        url: '/news',
        controller: Controllers.News,
        controllerAs: 'news',
        template: templateAsString('news.html')
    });

    $stateProvider.state('about', {
        url: '/about',
        controller: Controllers.About,
        controllerAs: 'about',
        template: templateAsString('about.html')
    });

    $stateProvider.state('market', {
        url: '/market',
        controller: Controllers.Market,
        controllerAs: 'market',
        template: templateAsString('market.html')
    });

    $stateProvider.state('services', {
        url: '/services',
        controller: Controllers.Market,
        controllerAs: 'services',
        template: templateAsString('services.html')
    });

    $stateProvider.state('backup', {
        url: '/backup',
        controller: Controllers.Backup,
        controllerAs: 'backup',
        template: templateAsString('backup.html')
    });

    $stateProvider.state('ncc', {
        sticky: true,
        views: {
            'wallet': {
                template: '<iframe ng-src="{{ncc.url}}" frameBorder="0" class="ncc-iframe" nwdisable></iframe>',
                controllerAs: 'ncc',
                controller: Controllers.NCC
            }
        }
    });
}])
.run(['Java', 'NemProperties', 'WalletConfig', '$timeout', 'Log', '$state', 'NEM', (
        Java: Services.Java,
        NemProperties: Providers.INemConfigInstance,
        WalletConfig: Providers.WalletConfig,
        $timeout: ng.ITimeoutService,
        Log: Services.Log,
        $state: ng.ui.IStateService,
        NEM: any
    ) => {

    request.get('http://bob.nem.ninja/version.txt', {}, (err: Error, res: any, version: string) => {
        var v = version.match(/([\d]+\.[\d]+\.[\d]+)-?([A-Z]+)/);
        NEM.version = v[1];
        NEM.beta = typeof v[2] !== 'undefined' && v[2] === 'BETA';

        Log.add('Latest NEM version is ' + NEM.version + (NEM.beta ? ' (BETA)' : ''), 'client');

        Java
        .decide()
        .then(() => {
            return NemProperties.instance('nis').download().then(() => {
                return NemProperties.instance('nis').run();
            }).then(() => {
                return NemProperties.instance('ncc').run();
            });
        })
        .then(() => {
            $timeout(() => {
                WalletConfig.loaded = true;
                $state.go('ncc');
            });
        });
    });

    function killAll() {
        NemProperties.killAll().then(() => {
            process.exit();
        });
    }

    WalletConfig.exitCallback = killAll;

    process
    .on('exit', killAll)
    .on('SIGTERM', () => {
        NemProperties.killAll().then(killAll);
    })
    .on('SIGINT', () => {
        NemProperties.killAll().then(killAll);
    });

    win.on('close', function() {
        NemProperties.killAll().then(() => {
            win.hide();
            gui.App.quit();
        });
    });

    win.on('new-win-policy', function(frame: any, url: string, policy: any) {
        policy.ignore();
        gui.Shell.openExternal(url);
    });
}])
;

}

/*
function clearCache(complete) {
    var cacheDirectory = gui.App.dataPath + (process.platform == "win32" ? "\\" : "/") + "Cache";

    if (fs.existsSync(cacheDirectory)) {
        var rmdir = require("rimraf");

        rmdir(cacheDirectory, function(error) {
            if (complete) {
                complete();
            }
        });
    } else if (complete) {
        complete();
    }
}

function loadPreferences() {
    var storedPrefs = localStorage.getItem("preferences");

    if (!storedPrefs) {
        storedPrefs = defaultPrefs;
    } else {
        try {
            storedPrefs = JSON.parse(storedPrefs);
        } catch (e) {
            storedPrefs = defaultPrefs;
        }
    }

    preferences = storedPrefs;
}

function savePreferences() {
    if (platform == "win") {
        var minimizeToTray = (document.getElementById("minimize_to_tray").checked ? 1 : 0);
    } else {
        var minimizeToTray = 0;
    }

    var checkForUpdates = (document.getElementById("check_for_updates").checked ? (document.getElementById("check_for_beta_updates").checked ? 2 : 1) : 0);

    preferences = {
        "minimizeToTray": minimizeToTray,
        "checkForUpdates": checkForUpdates
    };

    localStorage.setItem("preferences", JSON.stringify(preferences));

    addUpdateBehavior();
    addTrayBehavior();
}

function showPreferencesWindow() {
    if (showQuitAlert) {
        return;
    }

    bootbox.dialog({
        message: (platform == "win" ? "<div class='checkbox'><input type='checkbox' name='minimize_to_tray' id='minimize_to_tray' value='1' " + (preferences.minimizeToTray ? " checked='checked'" : "") + " style='margin-left:0' /> <label for='minimize_to_tray'>Minimize to tray</label></div>" : "") +
            "<div class='checkbox'><input type='checkbox' name='check_for_updates' id='check_for_updates' value='1' " + (preferences.checkForUpdates != 0 ? " checked='checked'" : "") + " style='margin-left:0' /> <label for='check_for_updates'>Automatically check for updates</label></div>" +
            "<div class='checkbox'><input type='checkbox' name='check_for_beta_updates' id='check_for_beta_updates' value='1' " + (preferences.checkForUpdates == 2 ? " checked='checked'" : "") + " style='margin-left:0' /> <label for='check_for_beta_updates'>Update to beta versions when available</label></div>",
        title: "Preferences",
        buttons: {
            save: {
                label: "OK",
                className: "btn-primary",
                callback: function() {
                    savePreferences();
                }
            }
        }
    });
}

function checkPlatform() {
    if (process.platform == "darwin") {
        platform = "mac";
        javaLocations.push("/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin/java");
        //usr/libexec/java_home -v 1.7
    } else if (process.platform == "win32") {
        platform = "win";
        javaLocations.push("C:\\Program Files\\Java\\jre7\\bin\\java.exe");
        javaLocations.push("C:\\Program Files (x86)\\Java\\jre7\\bin\\java.exe");
        javaLocations.push("C:\\Program Files\\Java\\jre8\\bin\\java.exe");
        javaLocations.push("C:\\Program Files (x86)\\Java\\jre8\\bin\\java.exe");
        startCommand = "nxt.jar;lib\\*;conf";
        dirSeparator = "\\";

        if (process.arch === "x64" || process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432")) {
            is64bit = true;
        } else {
            is64bit = false;
        }
    } else {
        platform = "linux";
        javaLocations.push("/usr/bin/java");
    }
}

function prepareWindow() {
    win.on("close", function() {
        win.hide();

        systemClose = true;
        doNotQuit = true;

        killNrs(function() {
            clearCache(function() {
                gui.App.quit();
            });
        })
    });

    win.on("new-win-policy", function(frame, url, policy) {
        policy.ignore();
        require("nw.gui").Shell.openExternal(url);
    });
}

function showContextMenu(e) {
    try {
        e.preventDefault();
        var gui = require("nw.gui");
        var menu = new gui.Menu();

        var isInputField = e.toElement && (e.toElement.nodeName == "INPUT" || e.toElement.nodeName == "TEXTAREA");

        var selectedText = document.getElementById("nrs").contentWindow.getSelection().toString();

        var cut = new gui.MenuItem({
            label: "Cut",
            enabled: (isInputField && selectedText ? true : false),
            click: function() {
                try {
                    document.getElementById("nrs").contentWindow.document.execCommand("cut");
                } catch (e) {}
            }
        });

        var copy = new gui.MenuItem({
            label: "Copy",
            enabled: (selectedText ? true : false),
            click: function() {
                try {
                    document.getElementById("nrs").contentWindow.document.execCommand("copy");
                } catch (e) {}
            }
        });

        var paste = new gui.MenuItem({
            label: "Paste",
            enabled: isInputField,
            click: function() {
                try {
                    document.getElementById("nrs").contentWindow.document.execCommand("paste");
                } catch (e) {}
            }
        });

        menu.append(cut);
        menu.append(copy);
        menu.append(paste);

        menu.popup(e.x, e.y);
    } catch (e) {}

    return false;
}

function createMenuBar() {
    var menubar = new gui.Menu({
        type: "menubar"
    });

    var toolsMenu = new gui.Menu();

    menubar.append(new gui.MenuItem({
        label: "Tools",
        submenu: toolsMenu
    }));

    toolsMenu.append(new gui.MenuItem({
        label: "Check For Updates",
        click: function() {
            manuallyCheckingForUpdates = true;
            checkForUpdates();
        }
    }));

    toolsMenu.append(new gui.MenuItem({
        label: "Preferences",
        click: function() {
            showPreferencesWindow();
        }
    }));

    toolsMenu.append(new gui.MenuItem({
        type: "separator"
    }));

    netSwitcher = new gui.MenuItem({
        label: "Switch Net",
        //enabled: false,
        click: function() {
            switchNet();
        }
    });

    toolsMenu.append(netSwitcher);

    toolsMenu.append(new gui.MenuItem({
        label: "Redownload Blockchain",
        click: function() {
            redownloadBlockchain();
        }
    }));

    var helpMenu = new gui.Menu();

    helpMenu.append(new gui.MenuItem({
        label: "Nxt.org",
        click: function() {
            require("nw.gui").Shell.openExternal("http://nxt.org/");
        }
    }));

    helpMenu.append(new gui.MenuItem({
        label: "Support Forum",
        click: function() {
            require("nw.gui").Shell.openExternal("https://nxtforum.org/");
        }
    }));

    helpMenu.append(new gui.MenuItem({
        label: "Wiki",
        click: function() {
            require("nw.gui").Shell.openExternal("http://www.thenxtwiki.org/");
        }
    }));

    helpMenu.append(new gui.MenuItem({
        label: "IRC Channel",
        click: function() {
            require("nw.gui").Shell.openExternal("https://kiwiirc.com/client/irc.freenode.org/#nxtalk");
        }
    }));

    helpMenu.append(new gui.MenuItem({
        type: "separator"
    }));

    helpMenu.append(new gui.MenuItem({
        label: "View Server Log",
        click: function() {
            viewServerLog();
        }
    }));

    menubar.append(new gui.MenuItem({
        label: "Help",
        submenu: helpMenu
    }));

    win.menu = menubar;
}

function addTrayBehavior() {
    if (platform != "win") {
        return;
    }

    if (preferences.minimizeToTray) {
        if (!minimizeCallback) {
            minimizeCallback = function() {
                this.hide();

                tray = new gui.Tray({
                    title: "Nxt Wallet",
                    tooltip: "Nxt Wallet",
                    icon: "img/logo.png"
                });

                tray.on("click", function() {
                    win.show();
                    win.focus();
                    this.remove();
                    tray = null;
                });
            }
        }

        win.on("minimize", minimizeCallback);
    } else if (minimizeCallback) {
        win.removeListener("minimize", minimizeCallback);
        minimizeCallback = null;
    }
}

function findNxtDirectory(callback) {
    var cwd = path.dirname(process.execPath);

    var sourceDirectory = cwd + dirSeparator + "nxt" + dirSeparator;

    var doInitialCopy = false;

    if (platform == "win") {
        nxtDirectory = gui.App.dataPath + dirSeparator + "nxt" + dirSeparator;

        if (!fs.existsSync(sourceDirectory)) {
            alert("Could not find the Nxt directory. Make sure it is in the same folder as this app, and named 'nxt'.");
            win.close();
        } else {
            if (!fs.existsSync(nxtDirectory)) {
                doInitialCopy = true;
            } else {
                try {
                    var statSource = fs.statSync(sourceDirectory + "nxt.jar");
                    var statDestination = fs.statSync(nxtDirectory + "nxt.jar");

                    if (statDestination.mtime.getTime() < statSource.mtime.getTime()) {
                        doInitialCopy = true;
                    }
                } catch (e) {}
            }

            if (doInitialCopy) {
                var ncp = require("ncp").ncp;

                ncp.limit = 16;

                ncp(sourceDirectory, nxtDirectory, function(err) {
                    if (err) {
                        alert("Could not install the Nxt directory.");
                        win.close();
                    } else {
                        callback();
                    }
                });
            }
        }
    } else {
        nxtDirectory = sourceDirectory;

        if (platform == "mac") {
            var pos = nxtDirectory.indexOf("Nxt Wallet.app");

            if (pos != -1) {
                nxtDirectory = nxtDirectory.substring(0, pos) + "nxt" + dirSeparator;
            }
        }
    }

    if (!doInitialCopy) {
        if (!fs.existsSync(nxtDirectory)) {
            alert("Could not find the Nxt directory. Make sure it is in the same folder as this app, and named 'nxt'.");
            win.close();
        } else {
            callback();
        }
    }
}

function relaunchApplication() {
    require("nw.gui").Window.get().reload();
}

function startServer() {
    checkJavaLocation(javaLocations[currentLocationTest]);
}

//execFile is asynchronous...
function checkJavaLocation(location) {
    var found = false;

    if (location == "java" || fs.existsSync(location)) {
        try {
            var error = false;

            var child = execFile(location, ["-version"]);

            child.stderr.on("data", function(data) {
                var java_version = data.match(/java version "([0-9\.]+)/i);

                if (java_version && java_version[1] && versionCompare(java_version[1], "1.7.0") != -1) {
                    found = true;
                    startServerProcess(location);
                }
            });

            child.on("error", function(e) {
                error = true;
                checkNextJavaLocation();
            });

            child.on("exit", function() {
                //wait 1 second before going to the next one...
                setTimeout(function() {
                    if (!found && !error) {
                        checkNextJavaLocation();
                    }
                }, 1000);
            });
        } catch (err) {
            checkNextJavaLocation();
        }
    } else {
        checkNextJavaLocation();
    }
}

function checkNextJavaLocation() {
    currentLocationTest++;
    if (javaLocations[currentLocationTest]) {
        checkJavaLocation(javaLocations[currentLocationTest]);
    } else {
        showNoJavaInstalledWindow();
    }
}

function getUserHome() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

function showNoJavaInstalledWindow() {
    if (showQuitAlert) {
        return;
    }

    document.getElementById("loading_indicator_container").style.display = "none";
    document.getElementById("server_output").innerHTML = "";

    bootbox.dialog({
        message: "<p>The correct java version was not found on your system. Click on the button below to start downloading." + (platform != "win" ? " Reopen the app after installation." : "") + "</p>" +
            "<div class='progress progress-striped active' style='margin-top:10px;margin-bottom:0;'>" +
            "<div id='java_download_progress' class='progress-bar' role='progressbar' aria-valuenow='0' aria-valuemin='0' aria-valuemax='100' style='width:0%'>" +
            "<span class='sr-only'>0% Complete</span>" +
            "</div>" +
            "</div>",
        title: "Java Not Found...",
        closeButton: false,
        buttons: {
            cancel: {
                label: "Cancel (Quit)",
                className: "btn-default",
                callback: function() {
                    win.close();
                }
            },
            download: {
                label: "Download",
                className: "btn-primary",
                callback: function() {
                    downloadJava();
                    $(".bootbox button").attr("disabled", true);
                    return false;
                }
            }
        }
    });
}

function downloadJava() {
    var url = require("url");

    var pageReq = http.get(javaUrl, function(res) {
        var body = "";

        res.on("data", function(chunk) {
            body += chunk;
        }).on("end", function() {
            var filename, regexFilename, extension;

            switch (platform) {
                case "win":
                    if (is64bit) {
                        filename = "windows-x64.exe";
                        regexFilename = "windows\-x64\.exe";
                    } else {
                        filename = "windows-i586.exe";
                        regexFilename = "windows\-i586\.exe";
                    }
                    extension = "exe";
                    break;
                case "mac":
                    filename = "macosx-x64.dmg";
                    regexFilename = "macosx\-x64\.dmg";
                    extension = "dmg";
                    break;
                case "linux":
                    filename = "linux-x64.rpm";
                    regexFilename = "macosx\-x64\.dmg";
                    extension = "rpm";
                    break;
            }

            var regex = new RegExp(jreRegex + regexFilename, "i");

            var downloadUrl = body.match(regex);

            if (downloadUrl && downloadUrl[0]) {
                downloadUrl = downloadUrl[0];
            } else {
                downloadUrl = javaUrl;
            }

            downloadUrl = downloadUrl.replace(/http:\/\//i, "https://");
            downloadUrl = downloadUrl.replace(/download\.oracle\.com/i, "edelivery.oracle.com");

            var downloadUrlParts = url.parse(downloadUrl);

            var options = {
                hostname: downloadUrlParts.hostname,
                path: downloadUrlParts.path,
                port: 443,
                method: "GET",
                rejectUnauthorized: false,
                headers: {
                    "Referer": javaUrl,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
                    "Accept-Language": "en-us",
                    "Connection": "keep-alive",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_2) AppleWebKit/537.75.14 (KHTML, like Gecko) Version/7.0.3 Safari/537.75.14",
                    "Accept-Encoding": "gzip,deflate",
                    "Cookie": "s_nr=" + new Date().getTime() + ";gpw_e24="+encodeURIComponent(javaUrl)+";s_cc=true;s_sq=%5B%5BB%5D%5D;oraclelicense=accept-securebackup-cookie",
                    "Host": "edelivery.oracle.com"
                }
            };

            var fileReq = https.request(options, function(res) {
                if (res.statusCode == 302 && res.headers.location) {
                    downloadUrlParts = url.parse(res.headers.location);

                    options.hostname = downloadUrlParts.hostname;
                    options.path = downloadUrlParts.path;
                    options.headers["Host"] = downloadUrlParts.hostname;

                    var downloadLocation = getUserHome() + dirSeparator + "nxt-java-install." + extension

                    var downloadReq = https.request(options, function(res) {
                        var len = parseInt(res.headers["content-length"], 10);
                        var cur = 0;
                        var total = len / 1048576; //bytes in 1 MB

                        var out = fs.createWriteStream(downloadLocation);

                        res.pipe(out);

                        res.on("data", function(chunk) {
                            cur += chunk.length;
                            document.getElementById("java_download_progress").style.width = (100.0 * cur / len).toFixed(2) + "%";
                        }).on("end", function() {
                            if (platform == "win") {
                                //do silent install
                                hideAlerts();

                                bootbox.dialog({
                                    message: "<p>Java is being installed, please wait...</p>",
                                    title: "Installing Java...",
                                    closeButton: false
                                });

                                var exec = require("child_process").exec;

                                try {
                                    var child = exec(downloadLocation + " /s", function(error, stdout, stderr) {
                                        if (error != null) {
                                            showAlertAndQuit("Installation failed, please install manually. The setup filed is located at " + downloadLocation + ".");
                                        } else {
                                            //ok, it's installed
                                            child.kill();

                                            relaunchApplication();
                                        }
                                    });
                                } catch (e) {
                                    showAlertAndQuit("Installation failed, please install manually. The setup filed is located at " + downloadLocation + ".");
                                }
                            } else if (platform == "mac") {
                                gui.Shell.openItem(downloadLocation);
                                setTimeout(function() {
                                    win.close();
                                }, 2000);
                            } else {
                                //give notice to the user to install manually
                                showAlertAndQuit("Java has been downloaded to " + downloadLocation + " - please install it and reopen this app after installation.");
                            }
                        }).on("error", function(e) {
                            downloadJavaFailed();
                        });
                    }).on("error", function(e) {
                        downloadJavaFailed();
                    });

                    downloadReq.end();
                } else {
                    downloadJavaFailed();
                }
            }).on("error", function(e) {
                downloadJavaFailed();
            });

            fileReq.end();
        });
    }).on("error", function(e) {
        downloadJavaFailed();
    });

    pageReq.end();
}

function downloadJavaFailed() {
    showAlertAndQuit("Download failed, please <a href='http://www.java.com/en/download/manual.jsp'>click here</a> to download and install java manually.");
}

function startServerProcess(javaLocation) {
    serverPort = "7876";

    try {
        nrs = execFile(javaLocation, ["-cp", startCommand, "nxt.Nxt"], {
            "cwd": nxtDirectory,
            "detached": true
        });

        nrs.stdout.on("data", function(data) {
            logServerOutput(data);
            checkServerOutput(data);
        });

        nrs.stderr.on("data", function(data) {
            logServerOutput(data);
            checkServerOutput(data);

            if (!nxtInitializationError && data.match(/java\.lang\.ExceptionInInitializerError|java\.net\.BindException/i)) {
                var msg = "";

                if (data.match(/java\.net\.BindException/i)) {
                    msg = "The server address is already in use. Please close any other apps/services that may be running on port " + serverPort + ".";
                } else if (data.match(/Database may be already in use/i)) {
                    msg = "The server database is already in use. Please close any other apps/services that may be connected to this database.";
                } else {
                    msg = "A server initialization error occurred.";
                }

                showInitializationAlert(msg, function() {
                    systemClose = true;
                    nxtInitializationError = false;
                    if (nrs.exitCode == null) {
                        nrs.kill();
                    } else {
                        win.close();
                    }
                });
            }
        });

        nrs.on("exit", function(code) {
            if (callback) {
                callback();
                callback = null;
                return;
            } else if (nxtInitializationError) {
                return;
            } else if (!systemClose) {
                document.getElementById("loading_indicator_container").style.display = "none";
                showAlertAndQuit("NRS server has exited.");
            } else if (!doNotQuit) {
                win.close();
            }
        });
    } catch (err) {
        showInitializationAlert();
    }
}

function serverStarted() {
    isStarted = true;

    addUpdateBehavior();

    document.getElementById("nrs").setAttribute("src", "http://localhost:" + serverPort + "?app");
}

function checkServerOutput(data) {
    if (!nxtVersion) {
        var match = data.match(/server version ([0-9\.]+[a-zA-Z]?)/i);

        if (match && match[1]) {
            nxtVersion = match[1];
        }
    }

    if (!isStarted) {
        if (data.match(/nxt\.isTestnet = "true"/i)) {
            isTestNet = true;
            netSwitcher.label = "Switch to Main Net";
            serverPort = "6876";
        } else if (data.match(/nxt\.isTestnet = "false"/i)) {
            isTestNet = false;
            netSwitcher.label = "Switch to Test Net";
        }

        if (data.match(/started successfully/i)) {
            serverStarted();
        }
    }
}

function logServerOutput(data) {
    serverOutput.push(data);
    if (serverOutput.length > 100) {
        serverOutput.shift();
    }

    if (nxtInitializationError || systemClose) {
        return;
    }

    if (!isStarted) {
        var opacities = [0.6, 0.7, 0.8, 0.9, 1];

        data = data.split("\n");

        var lastLines = [];

        for (var i = data.length; i >= 0; i--) {
            if (data[i]) {
                data[i] = $.trim(data[i].replace(/^\s*[0-9\s\-:\.]+\s*(INFO\s*:\s*)?/i, ""));

                if (data[i] && !data[i].match(/(^nxt)|enabled|disabled|database is at level|Invalid well known peer|:INFO:|genesis block|\.\.\.done|DEBUG/i)) {
                    var opacity = opacities.pop();

                    lastLines.push("<span style='opacity:" + opacity + "'>" + String(data[i]).escapeHTML() + "</span>");
                    if (lastLines.length == 5) {
                        break;
                    }
                }
            }
        }

        if (lastLines.length) {
            lastLines.reverse();

            document.getElementById("server_output").innerHTML = lastLines.join("<br />");
        }
    }
}

function viewServerLog() {
    if (showQuitAlert) {
        return;
    }

    hideAlerts();

    var log = serverOutput.join("\n");

    log = log.replace(/\n\s*\n/g, "\n");

    bootbox.dialog({
        message: "<p>Below are the last 100 messages from the server log:</p>" +
            "<textarea style='margin-top:10px;width:100%;' rows='6' class='form-control'>" + String(log).escapeHTML() + "</textarea>",
        title: "Server Log",
        buttons: {
            ok: {
                label: "OK",
                className: "btn-primary"
            }
        }
    });
}

function addUpdateBehavior() {
    if (preferences.checkForUpdates) {
        checkForUpdates();

        //once per day..
        updateInterval = setInterval(function() {
            checkForUpdates();
        }, 86400000);
    } else {
        clearInterval(updateInterval);
    }
}

function checkForUpdates() {
    if (!isStarted || nxtInitializationError || showQuitAlert) {
        manuallyCheckingForUpdates = false;
        return;
    }

    hideAlerts();

    if (isTestNet) {
        if (manuallyCheckingForUpdates) {
            showAlert("To check for updates you need to be connected to the main net, not the test net.");
            manuallyCheckingForUpdates = false;
        }
        return;
    }

    var versions = {};

    if (preferences.checkForUpdates == 2) {
        var normalRequest = http.get("http://localhost:" + serverPort + "/nxt?requestType=getAlias&aliasName=nrsversion", function(res) {
            var body = "";

            res.on("data", function(chunk) {
                body += chunk;
            }).on("end", function() {
                if (body.match(/errorCode/i)) {
                    versions.normal = {
                        "version": "0.0.0",
                        "hash": ""
                    };
                } else {
                    versions.normal = body;
                }
                checkForNewestUpdate(versions);
            }).on("error", function() {
                versions.normal = "error";
                checkForNewestUpdate(version);
            });
        }).on("error", function() {
            versions.normal = "error";
            checkForNewestUpdate(versions);
        });

        normalRequest.end();

        var betaRequest = http.get("http://localhost:" + serverPort + "/nxt?requestType=getAlias&aliasName=nrsbetaversion", function(res) {
            var body = "";

            res.on("data", function(chunk) {
                body += chunk;
            }).on("end", function() {
                if (body.match(/errorCode/i)) {
                    versions.beta = {
                        "version": "0.0.0",
                        "hash": ""
                    };
                } else {
                    versions.beta = body;
                }
                checkForNewestUpdate(versions);
            }).on("error", function() {
                versions.beta = "error";
                checkForNewestUpdate(versions);
            });
        }).on("error", function() {
            versions.beta = "error";
            checkForNewestUpdate(versions);
        });

        betaRequest.end();
    } else {
        var normalRequest = http.get("http://localhost:" + serverPort + "/nxt?requestType=getAlias&aliasName=nrsversion", function(res) {
            var body = "";

            res.on("data", function(chunk) {
                body += chunk;
            }).on("end", function() {
                if (body.match(/errorCode/i)) {
                    checkForUpdatesCompleted({
                        "version": "0.0.0",
                        "hash": ""
                    });
                } else {
                    var version = parseVersionAlias(body);
                    checkForUpdatesCompleted(version);
                }
            }).on("error", function() {
                checkForUpdatesFailed();
            });
        }).on("error", function() {
            checkForUpdatesFailed();
        });

        normalRequest.end();
    }
}

function downloadUpdateType(type) {
    if (type == "release") {
        var normalRequest = http.get("http://localhost:" + serverPort + "/nxt?requestType=getAlias&aliasName=nrsversion", function(res) {
            var body = "";

            res.on("data", function(chunk) {
                body += chunk;
            }).on("end", function() {
                if (body.match(/errorCode/i)) {
                    checkForUpdatesCompleted({
                        "version": "0.0.0",
                        "hash": ""
                    });
                } else {
                    var version = parseVersionAlias(body);
                    checkForUpdatesCompleted(version);
                }
            }).on("error", function() {
                checkForUpdatesFailed();
            });
        }).on("error", function() {
            checkForUpdatesFailed();
        });

        normalRequest.end();
    } else {
        var betaRequest = http.get("http://localhost:" + serverPort + "/nxt?requestType=getAlias&aliasName=nrsbetaversion", function(res) {
            var body = "";

            res.on("data", function(chunk) {
                body += chunk;
            }).on("end", function() {
                if (body.match(/errorCode/i)) {
                    checkForUpdatesCompleted({
                        "version": "0.0.0",
                        "hash": ""
                    });
                } else {
                    var version = parseVersionAlias(body);
                    checkForUpdatesCompleted(version);
                }
            }).on("error", function() {
                checkForUpdatesFailed();
            });
        }).on("error", function() {
            checkForUpdatesFailed();
        });

        betaRequest.end();
    }
}

function checkForNewestUpdate(versions) {
    if (!versions.beta || !versions.normal) {
        return;
    }

    if (versions.beta == "error" && versions.normal == "error") {
        checkForUpdatesFailed();
    } else if (versions.beta == "error") {
        checkForUpdatesCompleted(versions.normal);
    } else if (versions.normal == "error") {
        checkForUpdatesCompleted(versions.beta);
    } else {
        if (typeof versions.normal == "string") {
            var normal = parseVersionAlias(versions.normal);
        } else {
            var normal = versions.normal;
        }
        if (typeof versions.beta == "string") {
            var beta = parseVersionAlias(versions.beta);
        } else {
            var beta = versions.beta;
        }

        var result = versionCompare(normal.version, beta.version);

        if (result == 1) {
            checkForUpdatesCompleted(normal);
        } else {
            checkForUpdatesCompleted(beta);
        }
    }
}

function parseVersionAlias(contents) {
    if (!contents) {
        return {
            "version": "",
            "hash": ""
        };
    } else {
        contents = JSON.parse(contents);
        contents = contents.aliasURI.split(" ");

        return {
            "version": contents[0],
            "hash": contents[1]
        };
    }
}

function checkForUpdatesCompleted(update) {
    //this is done to prevent showing update notices whilst blockchain is still downloading..
    //should use another method later (messaging)
    if (versionCompare(update.version, "1.1.3") != 1) {
        if (manuallyCheckingForUpdates) {
            showAlert("Try again in a little bit, the blockchain is still downloading...");
            manuallyCheckingForUpdates = false;
        }
        return;
    }

    if (update.version) {
        var result = versionCompare(update.version, nxtVersion);

        if (result == 1) {
            if (manuallyCheckingForUpdates && !update.hash) {
                showAlert("The hash was not found, the update will not proceed.");
            } else {
                var changelogReq = https.get("https://bitbucket.org/JeanLucPicard/nxt/downloads/nxt-client-" + update.version + ".changelog.txt.asc", function(res) {
                    var changelog = "";

                    res.on("data", function(chunk) {
                        changelog += chunk;
                    }).on("end", function() {
                        update.changelog = changelog;
                        showUpdateNotice(update);
                    }).on("error", function(e) {
                        showUpdateNotice(update);
                    });
                }).on("error", function(e) {
                    showUpdateNotice(update);
                });

                changelogReq.end();
            }
        } else if (manuallyCheckingForUpdates) {
            showAlert("You are already using the latest version of the Nxt client (" + String(nxtVersion).escapeHTML() + ").");
        }
    } else if (manuallyCheckingForUpdates) {
        showAlert("Update information was not found, please try again later.");
    }

    manuallyCheckingForUpdates = false;
}

function checkForUpdatesFailed() {
    if (manuallyCheckingForUpdates) {
        showAlert("Could not connect to the update server, please try again later.");
        manuallyCheckingForUpdates = false;
    }
}

function showUpdateNotice(update) {
    if (showQuitAlert) {
        return;
    }

    document.getElementById("loading_indicator_container").style.display = "none";
    document.getElementById("server_output_container").style.display = "none";

    if (!update.changelog) {
        bootbox.confirm("A new version of the Nxt client is available (" + String(update.version).escapeHTML() + "). Would you like to update?", function(result) {
            if (result) {
                downloadNxt(update);
            }
        });
    } else {
        bootbox.dialog({
            message: "<p>A new version of the Nxt client is available (" + String(update.version).escapeHTML() + "). Would you like to update?</p>" +
                "<textarea style='margin-top:10px;width:100%;' rows='6' class='form-control'>" + String(update.changelog).escapeHTML() + "</textarea>",
            title: "Update Available",
            buttons: {
                cancel: {
                    label: "Cancel",
                    className: "btn-default"
                },
                update: {
                    label: "OK",
                    className: "btn-primary",
                    callback: function() {
                        downloadNxt(update);
                    }
                }
            }
        });
    }
}

function downloadNxt(update) {
    if (showQuitAlert) {
        return;
    }

    bootbox.dialog({
        message: "<p>The new client is being downloaded. Upon completion the app will restart.</p>" +
            "<div class='progress progress-striped active' style='margin-top:10px'>" +
            "<div id='nrs_update_progress' class='progress-bar' role='progressbar' aria-valuenow='0' aria-valuemin='0' aria-valuemax='100' style='width:0%'>" +
            "<span class='sr-only'>0% Complete</span>" +
            "</div>" +
            "</div>",
        title: "Updating Nxt Client...",
        closeButton: false
    });

    var temp = require("temp");

    temp.track();

    temp.mkdir("nxt-client", function(err, dirPath) {
        if (err) {
            installNxtFailed();
            return;
        }

        var downloadReq = https.get("https://bitbucket.org/JeanLucPicard/nxt/downloads/nxt-client-" + update.version + ".zip", function(res) {
            var len = parseInt(res.headers["content-length"], 10);
            var cur = 0;
            var total = len / 1048576; //bytes in 1 MB

            var zipPath = path.join(dirPath, "nxt-client-" + update.version + ".zip");

            var out = fs.createWriteStream(zipPath);

            res.pipe(out);

            res.on("data", function(chunk) {
                cur += chunk.length;
                document.getElementById("nrs_update_progress").style.width = (100.0 * cur / len).toFixed(2) + "%";
            }).on("end", function() {
                installNxt(zipPath, update.hash);
            }).on("error", function(e) {
                installNxtFailed();
            });
        }).on("error", function(e) {
            installNxtFailed();
        });

        downloadReq.end();
    });
}

function installNxt(zipPath, correctHash) {
    var AdmZip = require("adm-zip");
    var crypto = require("crypto");
    var algo = "sha256";

    var hash = crypto.createHash(algo);

    var zipData = fs.ReadStream(zipPath);

    zipData.on("data", function(d) {
        hash.update(d);
    }).on("end", function() {
        var d = hash.digest("hex");

        if (d !== correctHash) {
            showAlert("The hash of the downloaded update does not equal the one supplied by the blockchain. Aborting update.");
        } else {
            killNrs(function() {
                try {
                    var zip = new AdmZip(zipPath);
                    zip.extractAllTo(path.normalize(nxtDirectory + "../"), true);
                } catch (e) {}
                relaunchApplication();
            });
        }
    }).on("error", function() {
        installNxtFailed();
    });
}

function killNrs(fn) {
    if (nrs && nrs.exitCode == null) {
        callback = fn;
        nrs.kill();
    } else {
        callback = null;
        fn();
    }
}

function installNxtFailed() {
    showAlert("Could not connect to the update server, please try again later.");
}

function bodyLoaded() {
    setTimeout(function() {
        win.show();
    }, 150);

    findNxtDirectory(function() {
        //generateConfig();
        startServer();
    });
}

function switchNet() {
    systemClose = true;
    doNotQuit = true;

    killNrs(function() {
        addToConfig({
            "nxt.isTestnet": isTestNet ? "false" : "true"
        });

        relaunchApplication();
    });
}

function redownloadBlockchain() {
    systemClose = true;
    doNotQuit = true;

    killNrs(function() {
        var appData = gui.App.dataPath;

        if (isTestNet) {
            var filesToRemove = ["nxt_test_db" + dirSeparator + "nxt.h2.db", "nxt_test_db" + dirSeparator + "nxt.lock.db", "nxt_test_db" + dirSeparator + "nxt.trace.db"];
        } else {
            var filesToRemove = ["nxt_db" + dirSeparator + "nxt.h2.db", "nxt_db" + dirSeparator + "nxt.lock.db", "nxt_db" + dirSeparator + "nxt.trace.db"];
        }

        try {
            for (var i = 0; i < filesToRemove.length; i++) {
                fs.unlinkSync(appData + dirSeparator + "nxt" + dirSeparator + filesToRemove[i]);
            }
        } catch (err) {}

        relaunchApplication();
    });
}

function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

function addToConfig(settings) {
    var configFile = nxtDirectory + "conf" + dirSeparator + "nxt.properties";

    var settingKeys = Object.keys(settings);

    var contents = "";
    var newContents = "";
    var found = false;

    if (fs.existsSync(configFile)) {
        contents = fs.readFileSync(configFile, "utf8");
    }

    var lines = contents.split(/[^\r\n]+/g);

    for (var i = 0; i < lines.length; i++) {
        var setting = lines[i].explode("=", 2);

        if (setting.length == 2) {
            var settingKey = String(setting[0]).trim();
            var settingValue = String(setting[1]).trim();

            var index = settingKeys.indexOf(settingKey);

            if (index != -1) {
                newContents += settingKey + "=" + settings[settingKey] + "\r\n";
                settingKeys.splice(index, 1);
            } else if (settingKey && settingValue) {
                newContents += settingKey + "=" + settingValue + "\r\n";
            }
        }
    }

    if (settingKeys.length) {
        for (var i = 0; i < settingKeys.length; i++) {
            newContents += settingKeys[i] + "=" + settings[settingKeys[i]] + "\r\n";
        }
    }

    if (newContents != contents) {
        try {
            fs.writeFileSync(configFile, newContents, {
                "encoding": "utf8"
            });
        } catch (err) {
            alert("Could not write to config file.");
        }
    }
}

function versionCompare(v1, v2) {
    if (v2 == undefined) {
        return -1;
    } else if (v1 == undefined) {
        return -1;
    }

    //https://gist.github.com/TheDistantSea/8021359 (based on)
    var v1last = v1.slice(-1);
    var v2last = v2.slice(-1);

    if (v1last == 'e') {
        v1 = v1.substring(0, v1.length - 1);
    } else {
        v1last = '';
    }

    if (v2last == 'e') {
        v2 = v2.substring(0, v2.length - 1);
    } else {
        v2last = '';
    }

    var v1parts = v1.split('.');
    var v2parts = v2.split('.');

    function isValidPart(x) {
        return /^\d+$/.test(x);
    }

    if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
        return NaN;
    }

    v1parts = v1parts.map(Number);
    v2parts = v2parts.map(Number);

    for (var i = 0; i < v1parts.length; ++i) {
        if (v2parts.length == i) {
            return 1;
        }
        if (v1parts[i] == v2parts[i]) {
            continue;
        } else if (v1parts[i] > v2parts[i]) {
            return 1;
        } else {
            return -1;
        }
    }

    if (v1parts.length != v2parts.length) {
        return -1;
    }

    if (v1last && v2last) {
        return 0;
    } else if (v1last) {
        return 1;
    } else if (v2last) {
        return -1;
    } else {
        return 0;
    }
}

function hideAlerts() {
    bootbox.hideAll();
}

function showAlert(msg) {
    if (showQuitAlert) {
        return;
    }

    hideAlerts();

    bootbox.alert(msg);
}

function showAlertAndQuit(msg, callback) {
    if (showQuitAlert) {
        return;
    }

    showQuitAlert = true;

    hideAlerts();

    if (!msg) {
        msg = "An error occurred, the server has quit. Please restart the application.";
    }

    bootbox.alert(msg, function() {
        if (callback) {
            callback();
        } else {
            win.close();
        }
    });
}

function showInitializationAlert(msg, callback) {
    if (nxtInitializationError) {
        return;
    }

    nxtInitializationError = true;

    document.getElementById("loading_indicator_container").style.display = "none";
    document.getElementById("server_output").innerHTML = "Exception occurred";

    showAlertAndQuit(msg, callback);
}

window.addEventListener("message", receiveMessage, false);

function receiveMessage(event) {
    if (event.origin != "http://localhost:7876" && event.origin != "http://localhost:6876") {
        return;
    }

    if (typeof event.data == "object") {
        if (event.data.type == "copy") {
            var clipboard = gui.Clipboard.get();
            clipboard.set(event.data.text, "text");
        } else if (event.data.type == "update") {
            manuallyCheckingForUpdates = true;
            downloadUpdateType(event.data.update.type);
        } else if (event.data.type == "language") {

        } else if (event.data.type == "appUpdate") {

        }
    } else if (event.data == "loaded") {
        document.getElementById("nrs_container").style.display = "block";
        document.getElementById("loading_indicator_container").style.display = "none";
        document.getElementById("server_output_container").style.display = "none";

        try {
            document.getElementById("nrs").contentWindow.document.body.addEventListener("contextmenu", showContextMenu, false);
        } catch (e) {}
    }
}*/