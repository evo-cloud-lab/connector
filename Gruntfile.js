module.exports = function (grunt) {
    grunt.loadNpmTasks('grunt-mocha-test');
    grunt.initConfig({
        mochaTest: {
            unit: {
                options: {
                    reporter: 'spec',
                    grep: grunt.option('mocha-grep'),
                    invert: grunt.option('mocha-invert')
                },
                src: ['test/**/*-unit-test.js']
            },

            func: {
                options: {
                    reporter: 'spec',
                    grep: grunt.option('mocha-grep'),
                    invert: grunt.option('mocha-invert')
                },
                src: ['test/**/*-func-test.js']
            }
        }
    });

    grunt.registerTask('unit-test', 'mochaTest:unit');
    grunt.registerTask('func-test', 'mochaTest:func');
    grunt.registerTask('default', ['unit-test', 'func-test']);
};
