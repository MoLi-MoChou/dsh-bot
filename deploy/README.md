# DSH Bot web: run and deploy

Local, from `app/`:

    npm ci && DSH_BOT_PASSWORD=choose-one npm run web      # http://127.0.0.1:8290

Docker, from the repository root:

    docker build -t dsh-bot-web .
    docker run -d -p 8290:8290 -e DSH_BOT_PASSWORD=choose-one -v dsh-bot-data:/data dsh-bot-web

Server with compose: copy the repository, put `.env` next to `deploy/docker-compose.yml`
(`DSH_BOT_PASSWORD=…`, and a provider key such as `SENSENOVA_API_KEY=…`), optionally seed
`deploy/data/profiles/ds-bot/cordis.patch.yml` from `cordis.patch.example.yml`, then
`docker compose -f deploy/docker-compose.yml up -d --build`. Data (Bots, chats, memory,
settings) lives in `deploy/data`, mounted at `/data`.

Environment: `DSH_BOT_PASSWORD` (required off loopback), `DSH_BOT_WEB_HOST` (0.0.0.0 in
the image), `DSH_BOT_WEB_PORT` (8290), `DSH_BOT_DATA` (/data), `DSH_BOT_WORKSPACE`.
In the web version the desktop-only parts (window controls, app updater, data-folder
move) are hidden; updates come with a redeploy.
