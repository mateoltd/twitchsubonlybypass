# Phantom Twitch

A modern web application to watch sub-only VODs on Twitch with full feature support and adaptive quality playback.

## Features

- **Sub-only Bypass**: Watch VODs that are restricted to subscribers.
- **Adaptive Quality**: Automatic and manual quality selection (1080p, 720p, etc.).
- **Instant Seek**: Smooth seeking throughout the entire VOD.
- **Keyboard Shortcuts**: Control playback with your keyboard.
- **Shareable Links**: Share specific moments with timestamped URLs.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.17.0 or higher)
- [pnpm](https://pnpm.io/) (v10.x recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/mateoltd/phantom-twitch.git
   cd phantom-twitch
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/)
- **Library**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Player**: [hls.js](https://github.com/video-dev/hls.js/)
- **Icons**: [Tabler Icons](https://tabler-icons.io/)

## License

MIT License - Copyright (c) 2026 mateoltd

## Disclaimer

This project is for educational purposes only. Not affiliated with Twitch.
