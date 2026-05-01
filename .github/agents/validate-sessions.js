#!/usr/bin/env node

/**
 * Agent Session Validator
 * 
 * This script validates that all prerequisites are in place for using
 * custom AI agents in the gigs.ge repository.
 */

const fs = require('fs');
const path = require('path');

// Agent definition files
const AGENT_FILES = [
  '.github/agents/delivery-orchestrator.agent.md',
  '.github/agents/backend-workflow-builder.agent.md',
  '.github/agents/test-strategy-agent.agent.md',
  '.github/agents/documentation-handoff-agent.agent.md',
];

// All required files (includes agent files)
const REQUIRED_FILES = [
  'SYSTEM_DESIGN.md',
  'docs/backlog.json',
  'docs/guides/uat-readiness-handoff.md',
  'docs/guides/custom-ai-agents.md',
  'docs/guides/agent-skills-map.md',
  '.github/agents/sessions.yml',
  ...AGENT_FILES,
];

function checkFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    return {
      exists: true,
      size: stats.size,
      path: filePath
    };
  }
  return {
    exists: false,
    path: filePath
  };
}

function validateAgentFrontmatter(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    return { valid: false, error: 'File not found' };
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
  
  if (!frontmatterMatch) {
    return { valid: false, error: 'No frontmatter found' };
  }

  const frontmatter = frontmatterMatch[1];
  const requiredFields = ['name', 'description', 'tools', 'argument-hint', 'user-invocable'];
  const missing = [];

  for (const field of requiredFields) {
    if (!frontmatter.includes(`${field}:`)) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return { valid: false, error: `Missing fields: ${missing.join(', ')}` };
  }

  return { valid: true };
}

function main() {
  console.log('🔍 Agent Session Validator\n');
  console.log('Checking prerequisites for custom AI agents...\n');

  let allGood = true;

  // Check required files
  console.log('📄 Required Files:');
  for (const file of REQUIRED_FILES) {
    const result = checkFile(file);
    if (result.exists) {
      console.log(`  ✓ ${file} (${result.size} bytes)`);
    } else {
      console.log(`  ✗ ${file} - MISSING`);
      allGood = false;
    }
  }

  // Validate agent frontmatter
  console.log('\n🤖 Agent Definitions:');
  for (const agentFile of AGENT_FILES) {
    const result = validateAgentFrontmatter(agentFile);
    if (result.valid) {
      console.log(`  ✓ ${path.basename(agentFile)} - Valid frontmatter`);
    } else {
      console.log(`  ✗ ${path.basename(agentFile)} - ${result.error}`);
      allGood = false;
    }
  }

  // Check documentation freshness
  console.log('\n📅 Documentation Freshness:');
  const handoffFile = 'docs/guides/uat-readiness-handoff.md';
  const backlogFile = 'docs/backlog.json';
  
  const handoffResult = checkFile(handoffFile);
  const backlogResult = checkFile(backlogFile);

  if (handoffResult.exists) {
    const handoffPath = path.join(process.cwd(), handoffFile);
    const stats = fs.statSync(handoffPath);
    const daysSinceUpdate = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    
    if (daysSinceUpdate > 7) {
      console.log(`  ⚠ ${handoffFile} last updated ${Math.floor(daysSinceUpdate)} days ago`);
      console.log('    Consider updating before using agents');
    } else {
      console.log(`  ✓ ${handoffFile} recently updated`);
    }
  }

  if (backlogResult.exists) {
    const backlogPath = path.join(process.cwd(), backlogFile);
    const stats = fs.statSync(backlogPath);
    const daysSinceUpdate = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    
    if (daysSinceUpdate > 7) {
      console.log(`  ⚠ ${backlogFile} last updated ${Math.floor(daysSinceUpdate)} days ago`);
      console.log('    Consider updating before using agents');
    } else {
      console.log(`  ✓ ${backlogFile} recently updated`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allGood) {
    console.log('✅ All prerequisites met! Agents are ready to use.');
    console.log('\nNext steps:');
    console.log('  1. Read .github/agents/QUICKSTART.md');
    console.log('  2. Start with: @delivery-orchestrator analyze current status');
    console.log('  3. See .github/agents/README.md for detailed usage');
  } else {
    console.log('❌ Some prerequisites are missing.');
    console.log('\nPlease ensure all required files exist before using agents.');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkFile, validateAgentFrontmatter };
