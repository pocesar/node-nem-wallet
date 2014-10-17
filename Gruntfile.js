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
        },
        ts: {
            front: {
                src: [
                    'app/src/boot.ts'
                ],
                out: 'app/js/boot.js',
                reference: 'app/reference.ts',
                options: {
                    compile: true,
                    // 'es3' (default) | 'es5'
                    target: 'es5',
                    // 'amd' (default) | 'commonjs'
                    module: 'commonjs',
                    // true (default) | false
                    sourceMap: false,
                    // true | false (default)
                    declaration: false,
                    // true (default) | false
                    removeComments: true,
                    // Skip resolution and preprocessing
                    noResolve: false,
                    noImplicitAny: true
                },
            }
        }
    });

    grunt.loadNpmTasks('grunt-node-webkit-builder');
    grunt.loadNpmTasks('grunt-ejs');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-ts');

    grunt.registerTask('build', ['ts', 'concat', 'ejs']);
    grunt.registerTask('default', ['build', 'nodewebkit']);
};