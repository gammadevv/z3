import { fileURLToPath } from 'node:url';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { accounts } from './accounts.mjs';
import { commands } from './commands.mjs';
import { interactions } from './interactions.mjs';
import { scrobbling } from './scrobbling.mjs';
import { wayshipClient } from './wayship.mjs';

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
    console.error('Set DISCORD_TOKEN in bot/.env or in the environment before starting Zeta Discord.');
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
try {
    const store = accounts(process.env.ZETA_BOT_DATA_DIR || fileURLToPath(new URL('./.data/', import.meta.url)));
    client.on(Events.InteractionCreate, interactions({
        accounts: store,
        scrobbling: scrobbling(process.env.LASTFM_API_KEY?.trim()),
        wayship: wayshipClient(),
    }));
    client.on(Events.Error, (error) => console.error('Discord Gateway error', error.name, error.code ?? ''));
    client.once(Events.ClientReady, async ({ application, user }) => {
        try {
            await application.commands.set(commands);
            console.log(`Connected as ${user.tag}. Registered ${commands.length} global Zeta commands.`);
            const install = new URL('https://discord.com/oauth2/authorize');
            install.search = new URLSearchParams({
                client_id: application.id, integration_type: '1', scope: 'applications.commands',
            });
            console.log(`Add Zeta to your Discord account → ${install}`);
        } catch (error) {
            console.error('Could not register Zeta commands. Check that User Install is enabled.', error.name, error.code ?? '');
            client.destroy();
            process.exitCode = 1;
        }
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => client.destroy());
    await client.login(token);
} catch (error) {
    console.error('Could not start Zeta Discord.', error.name, error.code ?? '');
    client.destroy();
    process.exitCode = 1;
}
