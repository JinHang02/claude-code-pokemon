# Security Policy

## Supported versions

Security fixes go into the latest release.

## What the plugin does

It runs inside Claude Code and reads the names of the tools Claude runs, the shell commands it runs (to spot test runs and commits) and whether they succeeded. It never sends any of that anywhere. Its only network traffic is downloading sprites from GitLab ([pokemon-colorscripts](https://gitlab.com/phoneybadger/pokemon-colorscripts)) and evolution data from [PokeAPI](https://pokeapi.co), cached in your user cache folder (`~/.cache/claude-code-pokemon`, or `%LOCALAPPDATA%\claude-code-pokemon` on Windows). Only if its own clock reports UTC does it run a host command to double-check your time zone: `date +%z` on macOS and Linux, a one-line PowerShell time-zone query on Windows.

## Reporting a vulnerability

Please report security issues privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Don't open a public issue for them.

You'll get a reply as soon as possible, and a fix and a release once the issue is confirmed.
