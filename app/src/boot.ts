'use strict';

import Promise = require('bluebird');
import path = require('path');
import child_process = require('child_process');
import request = require('request');
import gui = require('nw.gui');
import _ = require('lodash');

var
    win: gui.Window = gui.Window.get(),
    semver: any = require('semver'),
    fs: any = Promise.promisifyAll(require('fs'));

interface IJavaVersion {
    arm: string;
    ia32: string;
    x64: string;
}

interface IJavaVersions {
    [index: string]: IJavaVersion;
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
}

function templateAsString(filename: string): Promise<string> {
    return fs.readFileAsync(path.join(process.cwd(), 'templates', filename)).then((v: Buffer) => {
        return v.toString();
    });
}

module Controllers {

    export class News {
        public FeedParser: any = require('feedparser');
        public news: any[];
        public static $inject: string[] = ['$scope','$sce'];

        fetch(): Promise<any> {
            return new Promise<any>((resolve: any, reject: any) => {
                var
                    req: any = request('https://forum.nemcoin.com/index.php?type=rss;action=.xml'),
                    feedparser: any = new this.FeedParser(),
                    items: any[] = [];

                req.on('error', (error: any) => {
                    console.log(error);
                });

                req.on('response', function (res: any) {
                    var stream: any = this;

                    if (res.statusCode !== 200) {
                        return this.emit('error', new Error('Bad status code'));
                    }

                    stream.pipe(feedparser);
                });

                feedparser.on('error', function(error: any) {
                    // always handle errors
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
                    var _items: any = {};
                    _.forEach(items, (item: any) => {
                        if (!_items[item.title]) {
                            _items[item.title] = {
                                title: item.title,
                                url: item.permalink,
                                summary: item.summary,
                                date: new Date(item.date)
                            };
                        }
                    });
                    resolve(_items);
                });
            });
        }

        getUrl(item: any) {
            return this.$sce.parseAsUrl(item.url);
        }

        constructor($scope: ng.IScope, private $sce: ng.ISCEService) {
            this.fetch().then((av: any) => {
                $scope.$apply(() => {
                    this.news = av;
                });
            });
        }
    }

    export class Log {
        static $inject: string[] = ['Log'];
    }

    export class Config {
        static $inject: string[] = [];

        constructor(){

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
            var config: INEMConfig = NEM.instance('ncc').config;
            this.url = $sce.trustAsResourceUrl(config.protocol + '://' + config.host + ':' + config[config.protocol + 'Port'] + config.homePath);
            console.log(this.url);
        }
    }

}

module Directives {

    export class ServerLog implements ng.IDirective {
        public restrict: string = 'E';

        constructor() {

        }

        static instance(){
            return [() => new this];
        }
    }

    export class Loading implements ng.IDirective {
        public template: string = '<div class="loading_indicator_container"><div class="loading_indicator"><img src="img/loading-bars.svg" /></div></div>';
        public restrict: string = 'E';

        constructor() {

        }

        static instance(){
            return [() => new this];
        }

    }

}

module Providers {

    export interface INemConfigInstance {
        killAll(): void;
        instance(instanceName: string): NemConfig;
    }

    export class NemConfig {
        public Hogan: any = require('hogan.js');
        public template: any = this.Hogan.compile(templateAsString('nem.properties.mustache'));
        public config: INEMConfig = {};
        private child: child_process.ChildProcess;

        render(data: INEMConfig = {}): string {
            return this.template.render(_.defaults(this.config, data));
        }

        saveToFile(): Promise<boolean> {
            return fs.writeFileAsync(path.join(this.config.folder, 'config.properties'), this.render());
        }

        set(config?: INEMConfig): NemConfig {
            if (config) {
                _.merge(this.config, config);
            }
            return this;
        }

        kill(signal: string = 'SIGTERM') {
            if (this.child) {
                this.child.kill(signal);
            }
        }

        run() {
            this.child = child_process.spawn('java', ['-cp', '.;./*;../libs/*', 'org.nem.core.deploy.CommonStarter'], {
                cwd: path.join(this.config.folder, this.name),
                env: process.env
            });

            this.child.stderr.on('data', (data: Buffer) => {
                console.log('stderr', data.toString());
            });

            this.child.stdout.on('data', (data: Buffer) => {
                console.log('stdout', data.toString());
            });

            this.child.on('close', () => {

            });

            this.child.on('error', () => {

            });
        }

        constructor(private name: string, data: INEMConfig = null) {
            this.set(data);
        }
    }

    export class NemProperties {
        public instances: {[index: string]: NemConfig} = {};

        $get(): INemConfigInstance {
            return {
                instance: (instance: string) => {
                    return this.instances[instance];
                },
                killAll: () => {
                    _.forEach(this.instances, (instance) => {
                        instance.kill();
                    });
                }
            };
        }

        instance(name: string, data: INEMConfig = {}) {
            return this.instances[name] = new NemConfig(name, data);
        }
    }
}

module Services {

    export interface ILog {
        time: number;
        msg: string;
    }

    export class Log {
        public logs: {[index: string]: ILog[]} = {};

        add(msg: string, group: string = 'global') {
            if (typeof this.logs[group] === 'undefined') {
                this.logs[group] = [];
            }
            this.logs[group].unshift({time: Date.now(), msg: msg});
            return this;
        }

        limit(limit: number = 20, start: number = 0, group: string = 'global') {
            if (typeof this.logs[group] === 'undefined') {
                return [];
            }
            return this.logs[group].slice(start, limit);
        }

        constructor() {

        }
    }

    export class Java {
        static $inject = ['Log'];
        static javaUrl: string = 'http://www.oracle.com/technetwork/java/javase/downloads/jre8-downloads-2133155.html';
        static jreRegex: string = 'https?:\/\/download\.oracle\.com\/otn-pub\/java\/jdk\/[^\/]+?\/jre-[^\-]+?-';
        static versionRegex: RegExp = /java version "([\.\d]+)[^"]+"/;
        static javaVersions: IJavaVersions = {
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
        public javaBin: string;

        getUrl(): any {
            var obj: any;

            if (typeof (obj = Java.javaVersions[process.platform]) === 'object'){
                if (typeof obj[process.arch] === 'string') {
                    return obj[process.arch];
                }
            }

            return false;
        }

        decide(): Promise<any> {
            return new Promise<any>((resolve: any, reject: any) => {
                var child: child_process.ChildProcess = child_process.spawn('java', ['-version'], {env: process.env});

                child.on('error', (err: Error) => {
                    reject(err);
                });

                child.stderr.on('data', (result: Buffer) => {
                    var version = result.toString().match(Java.versionRegex);

                    if (version && typeof version[1] === 'string') {
                        if (semver.satisfies(version[1], '>=1.8.0')) {
                            this.javaBin = 'java';
                            resolve(true);
                        } else {
                            reject(new Error('Java version less than 1.8'));
                        }
                    } else {
                        reject(new Error('No Java version found'));
                    }
                });
            });
        }

        constructor(public Log: Services.Log){ }
    }

}

angular
.module('app', ['ui.router','ngSanitize'])
.service('Java', Services.Java)
.service('Log', Services.Log)
.directive('serverLog', Directives.ServerLog.instance())
.provider('NemProperties', Providers.NemProperties)
.directive('loading', Directives.Loading.instance())
.config(['$stateProvider', '$locationProvider', '$urlRouterProvider', 'NemPropertiesProvider', (
    $stateProvider: ng.ui.IStateProvider,
    $locationProvider: ng.ILocationProvider,
    $urlRouterProvider: ng.ui.IUrlRouterProvider,
    NemPropertiesProvider: Providers.NemProperties) => {

    NemPropertiesProvider.instance('nis',{
        nis: true,
        folder: path.join(process.cwd(), 'nem'),
        shortServerName: 'Nis',
        maxThreads: 500,
        protocol: 'http',
        host: '127.0.0.1',
        httpPort: 7890,
        httpsPort: 7891,
        useDosFilter: true,
        nodeLimit: 20,
        bootWithoutAck: false,
        useBinaryTransport: true,
        useNetworkTime: true
    });

    NemPropertiesProvider.instance('ncc', {
        shortServerName: 'Ncc',
        folder: path.join(process.cwd(), 'nem'),
        maxThreads: 50,
        protocol: 'http',
        host: '127.0.0.1',
        httpPort: 8989,
        httpsPort: 9090,
        webContext: '/ncc/web',
        apiContext: '/ncc/api',
        homePath: '/index.html',
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

    $stateProvider.state('ncc', {
        url: '/ncc',
        template: '<iframe ng-src="{{ncc.url}}" frameBorder="0" class="ncc-iframe" nwdisable></iframe>',
        controllerAs: 'ncc',
        controller: Controllers.NCC
    });
}])
.run(['Java', 'NemProperties', '$templateCache', (
    Java: Services.Java,
    NemProperties: Providers.INemConfigInstance,
    $templateCache: ng.ITemplateCacheService
    ) => {

    //Java.decide().then(() => {
    //    NemProperties.instance('nis').run();
    //});

    win.on('close', function() {
        //win.hide();
        NemProperties.killAll();
        process.exit();
    });

    win.on('new-win-policy', function(frame: any, url: string, policy: any) {
        policy.ignore();
        gui.Shell.openExternal(url);
    });
}])
;

//clearCache();
//loadPreferences();
//checkPlatform();
//prepareWindow();
//createMenuBar();
//addTrayBehavior();
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