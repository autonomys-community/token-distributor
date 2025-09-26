# Autonomys Token Distributor

A robust, production-ready tool for distributing tokens on the Autonomys Network with comprehensive error handling, logging, and resume capabilities.

## Features

🚀 **Production Ready**
- Robust error handling and recovery
- Comprehensive logging system
- Resume capability for failed distributions
- Interactive user prompts for error resolution

📊 **Comprehensive Validation**
- CSV format validation
- Address format verification (Autonomys "su" and Substrate "5" addresses)
- Amount validation with Shannon-level precision (18 decimals)
- Existential deposit warnings (amounts below 0.00001 AI3)
- Duplicate detection

🌐 **Multi-Network Support**
- Autonomys Mainnet
- Chronos Testnet (default)
- Custom RPC endpoints

📈 **Advanced Features**
- Dry-run mode
- Batch processing
- Progress tracking
- Transaction confirmation monitoring
- Detailed transaction logs
- Balance validation with gas fee buffer

## Installation

### Prerequisites

- Node.js 20.0.0 or higher
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd token-distributor
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment configuration:
```bash
cp env.example .env
```

4. Edit `.env` file with your configuration:
```env
NETWORK=chronos
DISTRIBUTOR_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
LOG_LEVEL=info
LOG_TO_FILE=true
CONFIRMATION_BLOCKS=2
BATCH_SIZE=10
GAS_BUFFER_AI3=1
```

## Usage

### CSV File Format

Create a CSV file with the following format (no headers):

```csv
su7Wp2HqFcbJ8DYfFRjqvpZKqBxgGcF23UEp5Xvqmd4mCEQ,100.5
5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY,250.0
su9Op4LrHeyN0FZhHSlxrvpZKqBxgGcF67WEp7Xvqof6oGS,75.25
```

**Format Requirements:**
- Two columns: `address,amount`
- No headers
- Addresses must be valid SS58 format addresses:
  - **Autonomys addresses** (prefix 6094): start with "su" 
  - **Substrate addresses** (prefix 42): start with "5"
- Amounts must be positive decimal numbers with up to 18 decimal places
- One record per line

**💡 Existential Deposit Notice:**
- Amounts below **0.00001 AI3** will generate warnings
- Such transfers may fail for new accounts or accounts with insufficient balance
- They work fine for existing accounts with sufficient balance or smart contracts
- The tool will proceed with distribution but notify you of potential issues

### Running the Distributor

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm run build
npm start
```

#### Quick Distribution
```bash
npm run distribute
```

### Interactive Flow

1. **Start Application**: The tool will display a banner and check for previous incomplete distributions

2. **Resume Check**: If previous distribution data exists, you'll be asked if you want to resume

3. **CSV Input**: Provide the path to your CSV file

4. **Validation**: The tool validates the CSV format, addresses, and amounts

5. **Dry Run**: Option to run in dry-run mode (recommended for first-time use)

6. **Network Connection**: Connects to the Autonomys Network

7. **Balance Check**: Verifies sufficient balance in distributor account (including 1 token gas buffer)

8. **Confirmation**: Review distribution summary with balance information and confirm

9. **Distribution**: Execute the token distribution with real-time progress

10. **Completion**: Summary of results with detailed logs

## Configuration

### Environment Variables

| Variable | Description | Default | Options |
|----------|-------------|---------|---------|
| `NETWORK` | Target network | `chronos` | `mainnet`, `chronos` |
| `DISTRIBUTOR_PRIVATE_KEY` | Wallet private key | Required | 64-char hex (with/without 0x) |
| `RPC_ENDPOINT` | Custom RPC endpoint | Network default | WebSocket URL |
| `LOG_LEVEL` | Logging verbosity | `info` | `error`, `warn`, `info`, `verbose`, `debug` |
| `LOG_TO_FILE` | Enable file logging | `true` | `true`, `false` |
| `CONFIRMATION_BLOCKS` | Block confirmations | `2` | 1-100 |
| `BATCH_SIZE` | Processing batch size | `10` | 1-100 |
| `GAS_BUFFER_AI3` | Gas reserve (AI3 tokens) | `1` | Any positive number |

### Network Endpoints

- **Mainnet**: `wss://rpc.mainnet.autonomys.xyz/ws`
- **Chronos**: `wss://rpc.chronos.autonomys.xyz/ws`

## Logging

The tool generates comprehensive logs in the `logs/` directory:

### Log Files

- `distribution-{timestamp}.log` - General application logs
- `transactions-{timestamp}.log` - Transaction-specific logs
- `errors-{timestamp}.log` - Error logs only

### Log Levels

- **error**: Critical errors only
- **warn**: Warnings and errors
- **info**: General information (recommended)
- **verbose**: Detailed information
- **debug**: All debug information

## Resume Functionality

If a distribution fails or is interrupted:

1. **Automatic Resume**: On restart, the tool detects incomplete distributions
2. **Resume Data**: Stored in `.resume/` directory
3. **Progress Preservation**: Completed transactions are not repeated
4. **State Management**: Full state recovery including failed transactions

### Manual Resume Management

```bash
# View resume directory
ls .resume/

# Export resume data for analysis
node -e "
const { ResumeManager } = require('./dist/core/resume-manager');
const rm = new ResumeManager(console);
rm.exportResumeData('./resume-export.json');
"
```

## Error Handling

### Transaction Failures

When a transaction fails, you have options:
- **Retry**: Attempt the transaction again (up to 3 times)
- **Skip**: Skip this transaction and continue
- **Pause**: Save state and pause distribution
- **Abort**: Cancel entire distribution

### Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Invalid address | Malformed SS58 address | Verify address format (must start with "su" or "5") |
| Insufficient balance | Not enough tokens | Fund distributor account |
| Network timeout | Connection issues | Check network connectivity |
| Invalid amount | Non-numeric or negative | Fix amounts in CSV |
| Duplicate addresses | Same address multiple times | Review CSV for duplicates |

## Security Considerations

### Private Key Security
- Store private keys securely (never in plain text in production)
- Never commit `.env` files to version control
- Use environment variables or secure key management in production
- Rotate keys periodically for security

### Network Security
- Verify RPC endpoints
- Use official Autonomys endpoints when possible
- Monitor for unexpected network behavior

### Amount Validation
- Always use dry-run mode first
- Verify total amounts before distribution
- Double-check CSV data
- Monitor balances during distribution

### Balance Validation
- Tool automatically checks if distributor account has sufficient balance
- Includes 1 token buffer for gas fees
- Shows clear breakdown of required vs available tokens
- Warns if balance is insufficient before starting distribution

## API Reference

### Core Classes

#### `TokenDistributor`
Main distribution engine with Auto SDK integration.

```typescript
const distributor = new TokenDistributor(config, logger);
await distributor.initialize();
const summary = await distributor.distribute(records);
```

#### `CSVValidator`
Validates CSV files and addresses.

```typescript
const validator = new CSVValidator(logger);
const validation = await validator.validateCSV(filePath);
const records = await validator.parseValidatedCSV(filePath);
```

#### `ResumeManager`
Handles distribution state persistence.

```typescript
const resumeManager = new ResumeManager(logger);
await resumeManager.saveState(records, summary, index);
const resumeData = await resumeManager.loadLatestState();
```

### Data Types

```typescript
interface DistributionRecord {
  address: string;
  amount: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  transactionHash?: string;
  blockHash?: string;
  blockNumber?: number;
  error?: string;
  attempts?: number;
  timestamp?: Date;
}

interface DistributionSummary {
  totalRecords: number;
  completed: number;
  failed: number;
  skipped: number;
  totalAmount: string;
  distributedAmount: string;
  failedAmount: string;
  startTime: Date;
  endTime?: Date;
  resumedFrom?: number;
}
```

## Examples

### Basic Distribution

```bash
# 1. Set up environment
echo "NETWORK=chronos" > .env
echo "DISTRIBUTOR_PRIVATE_KEY=0x1234...abcdef" >> .env

# 2. Create CSV file
echo "su7Wp2HqFcbJ8DYfFRjqvpZKqBxgGcF23UEp5Xvqmd4mCEQ,100" > distribution.csv
echo "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY,200" >> distribution.csv

# 3. Run distribution
npm run distribute
```

### Large Distribution with Batching

```env
NETWORK=mainnet
DISTRIBUTOR_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
BATCH_SIZE=50
CONFIRMATION_BLOCKS=3
```

### Development Testing

```env
NETWORK=chronos
LOG_LEVEL=debug
LOG_TO_FILE=true
CONFIRMATION_BLOCKS=1
```

## Testing

The project includes comprehensive unit tests to ensure address validation and configuration work correctly.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Coverage

The test suite covers:
- ✅ **Address Validation**: Tests for both Autonomys and Substrate address formats
- ✅ **SS58 Decoding**: Validates proper cryptographic address validation
- ✅ **Amount Validation**: Tests for decimal amounts and edge cases
- ✅ **CSV Parsing**: File validation, error handling, and edge cases
- ✅ **Configuration**: Environment variable loading and validation
- ✅ **Network Configuration**: Network endpoint validation

### Test Structure

```
tests/
├── setup.ts                    # Test setup and crypto initialization
├── config/
│   ├── networks.test.ts        # Network configuration tests
│   └── index.test.ts           # Environment configuration tests
└── utils/
    └── validation.test.ts      # Address and CSV validation tests
```

## CI/CD

This project includes a unified GitHub Actions workflow that automatically runs:

- **Multi-version Testing**: Node.js 20.x and 22.x compatibility testing
- **Code Quality**: TypeScript compilation, linting, and formatting checks
- **Coverage Analysis**: 80% minimum threshold enforcement
- **Security Auditing**: Automated vulnerability scanning

See [CICD_SETUP.md](./CICD_SETUP.md) for detailed information about the automated workflow.

### Available Development Scripts

```bash
# Code Quality
npm run lint              # Check code with ESLint
npm run lint:fix          # Fix auto-fixable linting issues
npm run format            # Format code with Prettier
npm run format:check      # Check if code is formatted
npm run type-check        # TypeScript compilation check
```

## Troubleshooting

### Common Commands

```bash
# Check logs
tail -f logs/distribution-*.log

# View transaction logs
cat logs/transactions-*.log | jq

# Check resume state
ls -la .resume/

# Clean resume data
rm -rf .resume/

# Rebuild project
npm run build
```

### Debug Mode

Enable debug logging for detailed troubleshooting:

```env
LOG_LEVEL=debug
```

### Network Issues

Test network connectivity:

```bash
# Test RPC endpoint
curl -H "Content-Type: application/json" -d '{"id":1, "jsonrpc":"2.0", "method": "system_health"}' https://rpc.chronos.autonomys.xyz/ws
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Check the logs first
- Review this documentation
- Submit issues on GitHub
- Contact support team

## Changelog

### v1.0.0
- Initial release
- Full Auto SDK integration
- Comprehensive error handling
- Resume functionality
- Interactive CLI interface
- Multi-network support
