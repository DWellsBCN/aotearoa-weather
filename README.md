# Aotearoa Weather

A colourful Aotearoa New Zealand theme for the Claude desktop and mobile apps. On desktop the backdrop is a
near-photographic landscape drawn live on the GPU: ridged Southern Alps with snowfields and distance haze,
sunlit cumulus with grey bellies drifting overhead, a glacial lake mirroring the peaks with wind ripples,
tussock, lupins, a flowering pōhutukawa and harakeke. Mobile, and Reduce Motion, get an illustrated
version of the same: the Southern Alps with snow caps, a turquoise lake, rolling green hills, lupins, a pōhutukawa in bloom,
a koru fern and the long white cloud. The sky follows the live weather in a NZ city you pick: sun or moon and
the Southern Cross, more and darker clouds when it's overcast, rain, drizzle, snow or fog, and clouds that drift
faster when it's windy.

The app's colours are themed to match: lake turquoise, pōhutukawa red, fern green, kōwhai gold and lupin purple,
in light and dark mode.

- Weather comes from Open-Meteo (free, no key) every 15 minutes. Only the city's coordinates are sent.
- `/nz-weather` refreshes it now and shows the current reading.
- Pick your city in `/config` under `aotearoa-weather` (Auckland to Dunedin, default Wellington).
- The status line shows e.g. `Wellington 14° · Rain · 22 km/h`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install aotearoa-weather --marketplace DWellsBCN/aotearoa-weather
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```bash
claude plugin install aotearoa-weather --marketplace DWellsBCN/aotearoa-weather
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `DWellsBCN/aotearoa-weather`, then Add plugin.

This repository is private: it installs only for people who can read it on GitHub and whose machine already holds a git credential for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`).
