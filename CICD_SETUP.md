# CI/CD Setup for Autonomys Token Distributor

## Overview

This document describes the streamlined GitHub Actions workflows that automatically run tests and code quality checks when you push code to GitHub. This setup is designed for a local development tool that developers clone and run themselves.

## Workflow

### Unified Test & Quality Pipeline (`.github/workflows/test.yml`)

**Triggers:** Push to `main` or `develop` branches, Pull Requests to `main` or `develop`

**What it does:**
- **Multi-version testing:** Node.js 20.x and 22.x compatibility
- **TypeScript compilation:** Ensures type safety
- **Code quality:** ESLint linting and Prettier formatting checks
- **Comprehensive testing:** Full test suite with coverage analysis
- **Coverage enforcement:** 80% minimum threshold requirement
- **Build verification:** Ensures the project compiles successfully
- **Security:** npm audit for vulnerability checking

**Efficiency Benefits:**
- Single workflow reduces duplication and maintenance overhead
- Matrix strategy ensures compatibility across Node.js 20.x (LTS) and 22.x (Current)
- Conditional steps run security audits and coverage uploads only once (Node.js 20.x)
- Faster CI runs with shared setup and dependency installation

## GitHub Features

The project uses GitHub Actions for automated CI/CD.

## Local Development Tools

### Scripts Available

```bash
# Testing
npm test                   # Run all tests
npm run test:watch         # Watch mode for development
npm run test:coverage      # Generate coverage report

# Code Quality
npm run lint              # Check code with ESLint
npm run lint:fix          # Fix auto-fixable linting issues
npm run format            # Format code with Prettier
npm run format:check      # Check if code is formatted
npm run type-check        # TypeScript compilation check

# Building
npm run build             # Compile TypeScript
npm run distribute        # Build and run distribution
```

### Configuration Files

- **`.eslintrc.js`** - ESLint configuration for code quality
- **`.prettierrc.js`** - Prettier configuration for formatting
- **`jest.config.js`** - Jest test configuration

## What Happens When You Push

### On Push to Main/Develop or Pull Request:

**Single unified workflow runs:**
1. **Setup:** Installs dependencies across Node.js 20.x and 22.x
2. **Quality Checks:** TypeScript compilation, linting, formatting
3. **Testing:** Full test suite with coverage analysis
4. **Verification:** Build check and security audit
5. **Artifacts:** Coverage reports uploaded for analysis

## Monitoring and Maintenance

### Coverage Monitoring

- 80% minimum coverage required
- Coverage reports available in CI artifacts
- Detailed coverage files generated on each run

### Security

- npm audit runs on every push to check for vulnerabilities
- Manual dependency updates as needed

## Troubleshooting

### Common Issues

1. **Tests failing in CI but passing locally:**
   - Check Node.js version differences
   - Verify environment variables
   - Check for timing issues in tests

2. **Linting errors:**
   - Run `npm run lint:fix` locally
   - Check ESLint configuration
   - Verify Prettier formatting

3. **Coverage below threshold:**
   - Add more unit tests
   - Check test file patterns in Jest config
   - Review coverage report details

### Useful Commands

```bash
# Debug linting issues
npm run lint -- --debug

# Check specific files
npm run lint src/specific-file.ts

# Generate detailed coverage
npm run test:coverage -- --verbose

# Test specific files
npm test -- --testPathPattern=validation
```
