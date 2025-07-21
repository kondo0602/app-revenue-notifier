# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is a Google Apps Script application that fetches AdMob revenue data and sends notifications to Slack. The codebase is JavaScript-based (V8 runtime) with pnpm as the package manager for development tools.

## Important Commands
```bash
# Install dependencies (development tools only)
pnpm install

# Format code
pnpm run format

# Lint code
pnpm run lint

# Deploy to Google Apps Script
clasp push

# Open Google Apps Script editor
clasp open
```

## Architecture & Key Components
- **src/main.js**: Entry point that orchestrates the revenue fetching and notification flow
- **src/admob.js**: AdMob API integration, handles OAuth2 authentication and revenue data retrieval
- **src/auth.js**: OAuth2 authentication flow implementation using Google's OAuth2 library
- **src/model.js**: Data models (RevenueReport, RevenueData) with serialization methods
- **src/slack.js**: Slack webhook integration for sending formatted revenue notifications

## Development Guidelines
1. **Code Style**: Uses Biome for formatting and linting with tab indentation and double quotes
2. **Google Apps Script Specifics**: 
   - No module system (all files are concatenated)
   - Use Google's built-in services (PropertiesService, UrlFetchApp, etc.)
   - OAuth2 library is included via Apps Script libraries
3. **Configuration**: Script properties store sensitive data (Slack webhook URLs, AdMob credentials)
4. **No Test Framework**: Testing must be done manually in the Apps Script editor

## Key Configuration Files
- **appsscript.json**: Defines GAS runtime (V8) and required OAuth scopes
- **.clasp.json**: Contains the script ID for deployment
- **biome.json**: Formatter and linter configuration