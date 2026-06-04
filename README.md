# SONAR Simulator

A static browser-based SONAR simulator for demonstrating:

- Passive sonar with approximate distance labels and visible sound-wave pulses from emitters
- Active sonar with automatic pings, range labels, and multi-target lock boxes
- Hidden sound-producing vessels with passive sound-wave pulses
- Drifting background-noise circles and stronger passive-sonar masking, without a background grid
- Silent object detection
- Underwater mapping
- Beam width and sonar range

## Controls

- **W / Up arrow**: Move forward
- **S / Down arrow**: Move backward
- **A / Left arrow**: Turn beam/vessel left
- **D / Right arrow**: Turn beam/vessel right
- **Shift**: Move faster
- **Tab**: Toggle passive and active sonar
- **R**: Reset simulation

## Sliders

- **Active sonar range**: Controls how far the active ping travels.
- **Beam width**: Controls whether the active sonar is a full circular ping or a narrower directional beam.
- **Ping speed**: Controls how fast the ping expands.
- **Auto ping rate**: Controls how often active sonar automatically sends pings. Strong repeated echoes from moving targets create white lock boxes, range lines, and split-beam indicators. Static objects do not lock. Lock distances use the last known active-sonar position and update only as the player moves, until another active ping refreshes the contact.
- **Background noise**: Adds drifting translucent background-noise circles and makes the hidden sound emitters much harder to find with passive sonar.
- **Turning speed**: Controls how quickly the vessel/beam rotates.

## Run locally

Open `index.html` in any modern browser.

No installation is required.

## Deploy to GitHub Pages

1. Create a GitHub repository.
2. Upload these files:
   - `index.html`
   - `style.css`
   - `script.js`
   - `README.md`
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/root` folder.
6. Save.
7. Open the GitHub Pages URL after deployment.
