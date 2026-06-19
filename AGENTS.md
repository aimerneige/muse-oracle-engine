# Project Rules

## Environment File

- Never read, create, modify, rename, move, or delete any file whose exact filename is `.env`.
- Do not access an `.env` file indirectly through shell commands, scripts, tools, or other programs.
- When an `.env` operation is required, explain why and provide the exact command or instructions for the user to run manually.
- This restriction applies only to files named exactly `.env`; files such as `.env.example` and `.env.local` may be read and modified normally.
