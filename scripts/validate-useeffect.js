#!/usr/bin/env node

/**
 * 🚨 USEEFFECT VALIDATOR 🚨
 *
 * This script scans all React files for useEffect violations and FAILS LOUDLY.
 * Run this BEFORE committing any changes to React components.
 *
 * Usage: node scripts/validate-useeffect.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Functions that should NEVER be in useEffect dependency arrays
// These either don't change between renders (stable context functions)
// or cause infinite re-render loops when added as dependencies
const BANNED_IN_DEPS = [
  // Context functions (stable - don't need to be dependencies)
  'updateSetting',
  'clearCache',
  'registerCallback',
  'dispatch',
  'showToast',

  // Auth-related functions (often create new references each render)
  'getSogniClient',
  'ensureClient',
  'logout',
  'checkExistingSession',

  // Initialization functions
  'initializeSogni',
  'initialize',

  // Event handlers (should never be dependencies)
  'handleClick',
  'handleChange',
  'handleSubmit',
  'handleClose',
  'handleOpen',

  // Fetching functions (can cause infinite loops)
  'fetchRewards',
  'fetchData',
  'loadData',
  'refresh',

  // Project/state management
  'setProject',
  'updateProject',
  'saveProject',
];

// Objects that should be destructured to primitives
const BANNED_OBJECTS = [
  'settings',
  'authState',
  'config',
  'state',
  'context',
  'project',
];

const violations = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Find all useEffect calls
  const useEffectRegex = /useEffect\s*\(/g;
  let match;

  while ((match = useEffectRegex.exec(content)) !== null) {
    const startIndex = match.index;

    // Find the dependency array by looking for }, [
    const afterEffect = content.substring(startIndex);
    const depsMatch = afterEffect.match(/\},\s*\[([^\]]*)\]/);

    if (!depsMatch) continue;

    const depsString = depsMatch[1];
    const deps = depsString.split(',').map(d => d.trim()).filter(Boolean);

    // Get line number
    const lineNumber = content.substring(0, startIndex).split('\n').length;

    // Check for violations
    const issues = [];
    const warnings = [];

    // Check 1: CRITICAL - Banned functions in dependencies
    deps.forEach(dep => {
      BANNED_IN_DEPS.forEach(banned => {
        if (dep === banned || dep.endsWith('.' + banned)) {
          issues.push(`🔴 CRITICAL: Contains banned function "${dep}" - REMOVE IT (causes re-render bugs)`);
        }
      });
    });

    // Check 2: CRITICAL - Whole objects instead of primitives
    deps.forEach(dep => {
      BANNED_OBJECTS.forEach(banned => {
        if (dep === banned) {
          issues.push(`🔴 CRITICAL: Contains whole object "${dep}" - extract specific primitives (e.g., ${dep}.someValue)`);
        }
      });
    });

    // Check 3: CRITICAL - Function calls in dependencies
    deps.forEach(dep => {
      if (dep.includes('()')) {
        issues.push(`🔴 CRITICAL: Contains function call "${dep}" - extract to primitive value`);
      }
    });

    // Check 4: WARNING - Many dependencies (suspicious but not automatically bad)
    if (deps.length > 10) {
      warnings.push(`⚠️  REVIEW: Has ${deps.length} dependencies - consider refactoring`);
    } else if (deps.length > 6) {
      warnings.push(`💡 Review: Has ${deps.length} dependencies - ensure they're all related to single purpose`);
    }

    if (issues.length > 0 || warnings.length > 0) {
      violations.push({
        file: path.relative(process.cwd(), filePath),
        line: lineNumber,
        deps: deps,
        issues: issues,
        warnings: warnings,
        severity: issues.length > 0 ? 'error' : 'warning'
      });
    }
  }
}

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules') {
        scanDirectory(filePath);
      }
    } else if (file.match(/\.(jsx|tsx)$/)) {
      scanFile(filePath);
    }
  });
}

// Main execution
console.log('🔍 Scanning for useEffect violations...\n');

const srcDir = path.join(__dirname, '..', 'src');
scanDirectory(srcDir);

const errors = violations.filter(v => v.severity === 'error');
const warnings = violations.filter(v => v.severity === 'warning');

if (violations.length === 0) {
  console.log('✅ No useEffect violations found!\n');
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log(`🔴 Found ${errors.length} CRITICAL useEffect error(s):\n`);

    errors.forEach((v, index) => {
      console.log(`${index + 1}. ${v.file}:${v.line}`);
      console.log(`   Dependencies: [${v.deps.join(', ')}]`);
      v.issues.forEach(issue => {
        console.log(`   ${issue}`);
      });
      console.log('');
    });
  }

  if (warnings.length > 0) {
    console.log(`💡 Found ${warnings.length} useEffect warning(s) (non-blocking):\n`);

    warnings.forEach((v, index) => {
      console.log(`${index + 1}. ${v.file}:${v.line}`);
      console.log(`   Dependencies: [${v.deps.join(', ')}]`);
      v.warnings.forEach(warning => {
        console.log(`   ${warning}`);
      });
      console.log('');
    });
  }

  if (errors.length > 0) {
    console.log('📖 Review CLAUDE.md section "useEffect Rules" for guidance\n');
    console.log('🔧 Fix CRITICAL errors before committing!\n');
    process.exit(1);
  } else {
    console.log('💡 Warnings are informational only - review when time permits\n');
    process.exit(0);
  }
}
