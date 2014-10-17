module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        ejs: {
            app: {
                options: {
                    version: '<%= pkg.version %>'
                },
                src: 'app/*.ejs',
                expand: true,
                ext: '.html',
            }
        },
        concat: {
            app: {
                options: {
                    banner: '(function(){\n',
                    footer: '\n})();',
                    nonull: true,
                },
                files: {
                    'app/js/boot.js': 'app/js/boot.js'
                }
            }
        },
        nodewebkit: {
            options: {
                platforms: ['win','osx','linux32','linux64'],
                buildDir: './build',
            },
            src: ['./app/**/*']
        }
    });

    grunt.loadNpmTasks('grunt-node-webkit-builder');
    grunt.loadNpmTasks('grunt-ejs');
    grunt.loadNpmTasks('grunt-contrib-concat');

    grunt.registerTask('build', ['concat', 'ejs']);
    grunt.registerTask('default', ['build', 'nodewebkit']);
};