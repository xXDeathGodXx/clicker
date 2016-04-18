import { APP_DIR, COVERAGE, TEST_DIR, TEST_DEST, TYPINGS_DIR } from './config';
import { join }          from 'path';
import * as chalk        from 'chalk';
import * as del          from 'del';
import * as gulp         from 'gulp';
import * as karma        from 'karma';
import * as loadPlugins  from 'gulp-load-plugins';
import * as runSequence  from 'run-sequence';
import * as util         from 'gulp-util';

let plugins: any = loadPlugins();

let ionicGulpfile: any = {
  gulpfile: require(join(process.cwd(), 'gulpfile.js')),
  logline: 'sourced Ionic\'s gulpfile @ ' + join(process.cwd(), 'gulpfile.js'),
};

util.log(ionicGulpfile.logline);

// compile typescript into individual files, project directoy structure is replicated under www/build/test
function buildTypescript(): any {
  'use strict';

  let tsProject: any = plugins.typescript.createProject('tsconfig.json', {
    typescript: require('typescript'),
  });
  let src: Array<any> = [
    join(TYPINGS_DIR, '/browser.d.ts'),
    join(APP_DIR, '**/*.ts'),
    join(TEST_DIR, '**/*.ts'),
  ];
  let result: any = gulp.src(src)
    .pipe(plugins.inlineNg2Template({ base: 'www', useRelativePaths: false }))
    .pipe(plugins.typescript(tsProject));

  return result.js
    .pipe(gulp.dest(TEST_DEST));
}

// compile E2E typescript into individual files, project directoy structure is replicated under www/build/test
function buildE2E(): any {
  'use strict';

  let tsProject: any = plugins.typescript.createProject('tsconfig.json', {
    typescript: require('typescript'),
  });
  let src: Array<any> = [
    join(TYPINGS_DIR, '/browser.d.ts'),
    join(APP_DIR, '**/*e2e.ts'),
  ];
  let result: any = gulp.src(src)
    .pipe(plugins.typescript(tsProject));

  return result.js
    .pipe(gulp.dest(TEST_DEST));
}

// delete everything used in our test cycle here
function clean(): any {
  'use strict';

  // You can use multiple globbing patterns as you would with `gulp.src`
  return del([TEST_DEST]).then((paths: Array<any>) => {
    util.log('Deleted', chalk.yellow(paths && paths.join(', ') || '-'));
  });
}

// run tslint against all typescript
function lint(): any {
  'use strict';

  return gulp.src(join(APP_DIR, '**/*.ts'))
    .pipe(plugins.tslint())
    .pipe(plugins.tslint.report(plugins.tslintStylish, {
      emitError: true,
      sort: true,
      bell: true,
    }));
}

// run jasmine unit tests using karma with Chrome, Karma will be left open in Chrome for debug
function debugKarma(done: Function): any {
  'use strict';

  new (<any>karma).Server(
    {
      configFile: join(process.cwd(), TEST_DIR, 'karma.config.js'),
      singleRun: false,
      browsers: ['Chrome'],
    },
    done
  ).start();
}

// run jasmine unit tests using karma with PhantomJS2 in single run mode
function startKarma(done: Function): any {
  'use strict';

  new (<any>karma).Server(
    {
      configFile: join(process.cwd(), TEST_DIR, 'karma.config.js'),
      singleRun: true,
    },
    done
  ).start();
}

function watchTest(): any {
  'use strict';

  plugins.watch(join(APP_DIR, '**/*.ts'), () => {
    gulp.start('test.watch.build');
  });
}

function patchApp(): any {

  let appSrc: string  = 'node_modules/ionic-angular/decorators/';
  let stubSrc: string = 'test/app.stub.js';
  let rename = require('gulp-rename');

  gulp.src(join(appSrc, 'app.js'))
    .pipe(rename('app.backup'))
    .pipe(gulp.dest(appSrc))

  util.log(join(appSrc, 'app.js') + ' has been backed up to ' + join(appSrc, 'app.backup'));

  gulp.src(stubSrc)
    .pipe(rename('app.js'))
    .pipe(gulp.dest(appSrc));

  util.log(join(appSrc, 'app.js') + ' has been patched with ' + stubSrc);
}

function restoreApp(): any {

  let appSrc: string  = 'node_modules/ionic-angular/decorators/';
  let rename = require('gulp-rename');

  gulp.src(join(appSrc, 'app.backup'))
    .pipe(rename('app.js'))
    .pipe(gulp.dest(appSrc))

  util.log(join(appSrc, 'app.backup') + ' has been restored to ' + join(appSrc, 'app.js'));
}

function bundleSpecs(done: Function): any {
  'use strict';

  let browserify: any = require('ionic-gulp-browserify-typescript');
  let glob: any = require('glob');
  let specs: any = glob.sync('**/*.spec.ts');

  browserify(
    {
      watch: false,
      src: [specs, './typings/main.d.ts'],
      outputPath: TEST_DEST,
      outputFile: 'test.bundle.js',
      browserifyOptions: {
        cache: {},
        packageCache: {},
        debug: true,
      },
    }
  ).on('end', done);
};

function remapIstanbul(): any {
  'use strict';

  let remapIstanbul: any = require('remap-istanbul/lib/gulpRemapIstanbul');

  return gulp.src(join(COVERAGE, 'istanbul-remap', 'coverage-final.json'))
    .pipe(remapIstanbul({
      reports: {
        'json': join(COVERAGE, 'istanbul-remap', 'coverage-remapped.json'),
      },
    }));
}

function reportIstanbul(done: any): any {
  'use strict';

  let istanbul: any = require('istanbul');
  let collector: any = new istanbul.Collector();
  let reporter: any = new istanbul.Reporter();

  let fs: any = require('fs');
  let pruned: any = JSON.parse(fs.readFileSync(join(COVERAGE, 'istanbul-remap', 'coverage-pruned.json')));

  collector.add(pruned);

  reporter.addAll([ 'text', 'lcov']);
  reporter.write(collector, false, done);
}

function pruneIstanbul(): any {
  'use strict';

  const toPrune: Array<string> = ['node_modules', '.spec.ts', '.d.ts', 'testUtils.ts'];
  let fs: any = require('fs');
  let remapped: any = JSON.parse(fs.readFileSync(join(COVERAGE, 'istanbul-remap', 'coverage-remapped.json')));
  let pruned: Object = {};

  Object.keys(remapped).forEach((key) => {
    let doPrune: any = toPrune.find((glob) => (key.indexOf(glob) > -1));
    // the find will return `undefined` if there is nothing to be pruned
    if (doPrune) return;
    pruned[key] = remapped[key];
    pruned[key].path = remapped[key].path.replace('/source/', '');
  });

  fs.writeFileSync(join(COVERAGE, 'istanbul-remap', 'coverage-pruned.json'), JSON.stringify(pruned));
}

gulp.task('test.bundle.specs', bundleSpecs);
gulp.task('test.build.e2e', buildE2E);
gulp.task('test.build.typescript', buildTypescript);
gulp.task('test.clean', clean);
gulp.task('test.karma', startKarma);
gulp.task('test.karma.debug', debugKarma);
gulp.task('test.lint', lint);
gulp.task('test.watch', watchTest);
gulp.task('remap-istanbul', remapIstanbul);
gulp.task('report-istanbul', reportIstanbul);
gulp.task('prune-istanbul', pruneIstanbul);
gulp.task('patch-app', patchApp);
gulp.task('restore-app', restoreApp);

// just a hook into ionic's build
gulp.task('ionic.build', (done: any) => {
  runSequence(
    'build',
    done
  );
});

gulp.task('test.build', (done: any) => {
  runSequence(
    ['test.clean'],
    ['sass', 'fonts', 'html'], // these are hooks into ionic
    'test.build.typescript',
    done
  );
});

gulp.task('test.bundle', (done: any) => {
  runSequence(
    'test.clean',
    'html', // this is a hook into ionic
    'test.bundle.specs',
    done
  );
});

// first time round we should nuke everything
gulp.task('test.watch.build', (done: any) => {
  runSequence(
    'test.build',
    'test.watch',
    done
  );
});

gulp.task('test', (done: any) => {
  runSequence(
    'test.build',
    'test.karma',
    done
  );
});

gulp.task('test.new', (done: any) => {
  runSequence(
    'patch-app',
    'test.bundle',
    ['test.karma', 'restore-app'],
    'remap-istanbul',
    'prune-istanbul',
    'report-istanbul',
    done
  );
});
