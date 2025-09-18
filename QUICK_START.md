# Quick Start Guide

## Prerequisites

- **Node.js 20.0+** (LTS recommended)
- **npm** (comes with Node.js)

## 1. Setup (5 minutes)

```bash
# Install dependencies
npm install

# Create environment file
cp env.example .env

# Edit .env with your configuration
nano .env
```

**Required in .env:**
```env
NETWORK=chronos
DISTRIBUTOR_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

## 2. Prepare Your CSV (2 minutes)

Create a CSV file with format: `address,amount`

```csv
su7Wp2HqFcbJ8DYfFRjqvpZKqBxgGcF67WEp7Xvqof6oGS,100.5
5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY,250.0
su9Op4LrHeyN0FZhHSlxrvpZKqBxgGcF67WEp7Xvqof6oGS,75.25
```

**Supported Address Formats:**
- **Autonomys addresses** (prefix 6094): start with "su"
- **Substrate addresses** (prefix 42): start with "5"

Use `example-distribution.csv` as a template.

## 3. Run Distribution (1 minute)

```bash
# Development mode
npm run dev

# Production mode
npm run distribute
```

## 4. Follow Interactive Prompts

1. **CSV Path**: Enter path to your CSV file
2. **Dry Run**: Choose "Yes" for first-time testing
3. **Confirmation**: Review summary and confirm
4. **Execute**: Watch progress and handle any errors

## Networks

- **Chronos Testnet** (recommended for testing): `chronos`
- **Mainnet** (production): `mainnet`

## Safety Tips

✅ **Always test first**:
- Use testnet (`chronos`) for initial testing
- Run dry-run mode before real distribution
- Verify CSV data thoroughly

✅ **Start small**:
- Test with 2-3 addresses first
- Gradually increase batch sizes
- Monitor logs for any issues

✅ **Backup important data**:
- Keep CSV files backed up
- Note down transaction hashes
- Save resume data if interrupted

## Common Issues

| Issue | Solution |
|-------|----------|
| "Invalid address" | Check SS58 format in CSV |
| "Insufficient balance" | Fund your distributor account |
| "Connection failed" | Check network and RPC endpoint |
| "CSV validation failed" | Fix format issues in CSV |

## Next Steps

After successful testing:
1. Switch to mainnet in `.env`
2. Fund mainnet distributor account
3. Run production distribution
4. Monitor logs and transaction confirmations

For detailed documentation, see [README.md](README.md).
