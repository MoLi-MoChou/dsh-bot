# Mochou web: run and deploy

Local, from `app/`:

    npm ci && MOCHOU_PASSWORD=choose-one npm run web      # http://127.0.0.1:8290

Docker, from the repository root:

    docker build -t mochou .
    docker run -d -p 8290:8290 -e MOCHOU_PASSWORD=choose-one -v mochou-data:/data mochou

Server with compose: copy the repository, put `.env` next to `deploy/docker-compose.yml`
(`MOCHOU_PASSWORD=…`, and a provider key such as `SENSENOVA_API_KEY=…`), optionally seed
`deploy/data/profiles/core/cordis.patch.yml` from `cordis.patch.example.yml`, then
`docker compose -f deploy/docker-compose.yml up -d --build`. Data (Bots, chats, memory,
settings) lives in `deploy/data`, mounted at `/data`.

Environment: `MOCHOU_PASSWORD` (required off loopback), `MOCHOU_WEB_HOST` (0.0.0.0 in
the image), `MOCHOU_WEB_PORT` (8290), `MOCHOU_DATA` (/data), `MOCHOU_WORKSPACE`.
In the web version the desktop-only parts (window controls, app updater, data-folder
move) are hidden; updates come with a redeploy.
