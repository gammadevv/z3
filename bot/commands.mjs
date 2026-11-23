import {
    ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder,
} from 'discord.js';
import { DISCORD_QUERY_LIMIT } from '../src/lib/wayship-discord.ts';
import { periods, services } from './scrobbling.mjs';

const serviceChoices = Object.entries(services).map(([value, name]) => ({ name, value }));
const periodChoices = Object.entries(periods).map(([value, period]) => ({ name: period.name, value }));
const command = (name, description) => new SlashCommandBuilder()
    .setName(name).setDescription(description)
    .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

const service = (builder, { required = false, wayship = false } = {}) => builder.addStringOption((option) => option
    .setName('service').setDescription('Listening service').setRequired(required)
    .addChoices(...serviceChoices, ...(wayship ? [{ name: 'Wayship', value: 'wayship' }] : [])));
const device = (builder) => builder.addStringOption((option) => option
    .setName('device').setDescription('Zeta device name or ID from /devices').setMaxLength(64));
const query = (builder, required = true) => builder.addStringOption((option) => option
    .setName('song').setDescription('Song title and artist').setMinLength(1).setMaxLength(DISCORD_QUERY_LIMIT).setRequired(required));
const share = (builder) => builder.addBooleanOption((option) => option
    .setName('share').setDescription('Show the result in the channel'));

export const transport = {
    play: 'Play a song on a linked Zeta device',
    playnext: 'Put a song first in the Zeta queue',
    enqueue: 'Add a song to the end of the Zeta queue',
    skip: 'Skip to the next track',
    previous: 'Go back to the previous track',
    pause: 'Pause playback in Zeta',
    unpause: 'Resume playback in Zeta',
    volume: 'Set the Zeta player volume',
    seek: 'Jump to a position in the current track',
    lyrics: 'Look up lyrics in Zeta',
};

function transportCommand(name, description) {
    const builder = command(name, description);
    if (['play', 'playnext', 'enqueue', 'lyrics'].includes(name)) query(builder, name !== 'lyrics');
    if (name === 'volume') builder.addIntegerOption((option) => option
        .setName('percent').setDescription('Volume from 0 to 100').setMinValue(0).setMaxValue(100).setRequired(true));
    if (name === 'seek') builder.addIntegerOption((option) => option
        .setName('seconds').setDescription('Seconds from the start').setMinValue(0).setMaxValue(86_400).setRequired(true));
    return device(builder);
}

export const commands = [
    command('help', 'Show Zeta Discord commands'),
    command('wayship', 'Connect your Wayship account for Zeta playback controls'),
    service(command('link', 'Link a scrobbling profile by username'), { required: true })
        .addStringOption((option) => option.setName('username').setDescription('Your public profile username')
            .setMinLength(1).setMaxLength(128).setRequired(true)),
    service(command('unlink', 'Remove a saved connection'), { required: true, wayship: true }),
    command('profile', 'See your linked music accounts'),
    share(device(service(command('playing', 'Show what you are listening to')))),
    share(service(command('recent', 'Show your five most recent listens'))),
    ...['tracks', 'artists'].map((kind) => share(service(command(`top${kind}`, `Show your most-listened-to ${kind}`))
        .addStringOption((option) => option.setName('period').setDescription('Time period').addChoices(...periodChoices)))),
    command('devices', 'List online Zeta devices on your Wayship account'),
    device(command('queue', 'Show what is coming up on a linked Zeta device')),
    ...Object.entries(transport).map(([name, description]) => transportCommand(name, description)),
].map((builder) => builder.toJSON());
