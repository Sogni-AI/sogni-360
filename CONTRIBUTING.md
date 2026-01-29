# Contributing to Sogni 360

Thank you for your interest in contributing to Sogni 360! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/sogni-360.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development Setup

```bash
# Install dependencies
npm install

# Configure backend
cp server/.env.example server/.env
# Add your Sogni credentials to server/.env

# Start development servers
cd server && npm run dev  # Terminal 1
npm run dev               # Terminal 2
```

## Code Style

- Run `npm run lint` before committing (must pass with 0 warnings)
- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Use meaningful variable and function names

## Commit Messages

Use conventional commit format:

```
type(scope): description

feat(editor): add angle preset selector
fix(viewer): correct auto-play timing
docs(readme): update installation steps
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Pull Requests

1. Ensure all tests pass: `npm test`
2. Ensure linting passes: `npm run lint`
3. Update documentation if needed
4. Provide a clear PR description
5. Reference any related issues

## Reporting Issues

When reporting bugs, please include:
- Browser and OS version
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)

## Questions?

- Open a [GitHub Discussion](https://github.com/AISuperApp/sogni-360/discussions)
- Join our [Discord](https://discord.gg/sogni)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
