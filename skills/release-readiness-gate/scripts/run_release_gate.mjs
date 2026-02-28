import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

const args = new Set(process.argv.slice(2));
const withApi = args.has('--with-api');
const withRemote = args.has('--with-remote');

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const nodeCmd = 'node';

function color(text, code) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

const ok = (text) => color(`OK   ${text}`, 32);
const warn = (text) => color(`WARN ${text}`, 33);
const fail = (text) => color(`FAIL ${text}`, 31);

function runCheck({ label, cmd, cmdArgs, critical }) {
  const commandString = [cmd, ...cmdArgs.map((arg) => {
    if (/[\s"]/g.test(arg)) {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  })].join(' ');

  console.log(`\n[check] ${label}`);
  console.log(`  $ ${commandString}`);

  const result = spawnSync(commandString, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true
  });

  const passed = result.status === 0;
  if (passed) {
    console.log(`  ${ok(label)}`);
    return { label, critical, passed: true };
  }

  if (critical) {
    console.log(`  ${fail(label)}`);
  } else {
    console.log(`  ${warn(label)}`);
  }
  return { label, critical, passed: false };
}

function run() {
  /** @type {{label:string,cmd:string,cmdArgs:string[],critical:boolean}[]} */
  const checks = [
    {
      label: 'sync game registries',
      cmd: npmCmd,
      cmdArgs: ['run', 'sync:games'],
      critical: true
    },
    {
      label: 'leaderboard reflection audit',
      cmd: nodeCmd,
      cmdArgs: ['skills/leaderboard-reflection-hardening/scripts/audit_leaderboard_reflection.mjs'],
      critical: true
    },
    {
      label: 'achievement coverage audit',
      cmd: nodeCmd,
      cmdArgs: ['skills/prelaunch-achievement-content-pass/scripts/audit_achievement_coverage.mjs'],
      critical: true
    },
    {
      label: 'GameHub syntax check',
      cmd: nodeCmd,
      cmdArgs: ['--check', 'src/platform/GameHub.js'],
      critical: true
    },
    {
      label: 'AchievementSystem syntax check',
      cmd: nodeCmd,
      cmdArgs: ['--check', 'src/platform/AchievementSystem.js'],
      critical: true
    }
  ];

  if (withApi) {
    checks.push({
      label: 'leaderboard API health check',
      cmd: npmCmd,
      cmdArgs: ['run', 'check:leaderboard'],
      critical: false
    });
  }

  if (withRemote) {
    checks.push({
      label: 'remote deploy check',
      cmd: npmCmd,
      cmdArgs: ['run', 'check:remote'],
      critical: false
    });
  }

  const results = checks.map(runCheck);
  const criticalFailed = results.filter((r) => r.critical && !r.passed);
  const optionalFailed = results.filter((r) => !r.critical && !r.passed);

  console.log('\n[summary]');
  for (const result of results) {
    const prefix = result.passed ? ok('PASS') : (result.critical ? fail('FAIL') : warn('WARN'));
    const kind = result.critical ? 'critical' : 'optional';
    console.log(`  ${prefix} ${result.label} (${kind})`);
  }

  if (criticalFailed.length > 0) {
    console.error(`\n${fail('release gate failed: blocking checks did not pass')}`);
    process.exitCode = 1;
    return;
  }

  if (optionalFailed.length > 0) {
    console.log(`\n${warn('release gate passed with optional warnings')}`);
    return;
  }

  console.log(`\n${ok('release gate passed')}`);
}

run();
