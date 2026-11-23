import {
    ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, LabelBuilder, MessageFlags,
    ModalBuilder, TextInputBuilder, TextInputStyle, escapeMarkdown,
} from 'discord.js';
import { transport } from './commands.mjs';
import { periods, profileUrl, services } from './scrobbling.mjs';
import { BotError, wayshipConnectUrl } from './wayship.mjs';

const CONNECT_BUTTON = 'zeta:wayship:open';
const CONNECT_MODAL = 'zeta:wayship:connect';
const TEXT_FLAGS = MessageFlags.SuppressEmbeds;
const PRIVATE = MessageFlags.Ephemeral;
const clean = (input, limit = 150) => escapeMarkdown(String(input ?? '').replace(/\s+/g, ' ').trim().slice(0, limit));
const trackLabel = ({ title, artist }, limit = 150) => [clean(title, limit), clean(artist, limit)].filter(Boolean).join(' by ');
const replyOptions = (content) => ({ content, allowedMentions: { parse: [] }, flags: TEXT_FLAGS });
const numberList = (items, format) => items.slice(0, 5).map((item, index) => `${index + 1}. ${format(item)}`).join('\n');
const clock = (seconds) => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function wayshipPrompt(handle) {
    const connected = handle ? `Connected to Wayship as **@${clean(handle)}**.\n\n` : '';
    return {
        ...replyOptions(connected + 'Open Wayship and approve a new Discord Bot connection. Sign in with the same account you use in Zeta, then paste the new app token in the private form.'),
        flags: PRIVATE | TEXT_FLAGS,
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open Wayship').setURL(wayshipConnectUrl),
            new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel('Enter app token').setCustomId(CONNECT_BUTTON),
        )],
    };
}

function tokenModal() {
    const token = new TextInputBuilder().setCustomId('token')
        .setStyle(TextInputStyle.Short).setPlaceholder('wsa_…').setMaxLength(2004).setRequired(true);
    return new ModalBuilder().setCustomId(CONNECT_MODAL).setTitle('Connect to Wayship')
        .addLabelComponents(new LabelBuilder().setLabel('New Wayship app token').setTextInputComponent(token));
}

function playbackLabel({ name, result: { playback } }) {
    if (!playback.track) return `Nothing is loaded on **${clean(name)}**.`;
    const verb = { playing: 'Now playing', paused: 'Paused', loading: 'Loading' }[playback.phase] ?? 'Current track';
    const time = playback.duration > 0 ? ` · ${clock(playback.position)} / ${clock(playback.duration)}` : '';
    return `**${verb}**\n${trackLabel(playback.track)}\nZeta · ${clean(name)}${time}`;
}

function pickService(profile, requested) {
    const service = requested ?? Object.keys(services).find((key) => profile[key]);
    if (!service || !profile[service]) throw new BotError('Link a listening profile first with /link.');
    return service;
}

function help() {
    return [
        '**Zeta for Discord**',
        '**Connect** · /wayship, /link, /unlink, /profile, /devices',
        '**Listening** · /playing, /recent, /toptracks, /topartists, /lyrics',
        '**Player** · /play, /playnext, /enqueue, /queue, /skip, /previous, /pause, /unpause, /seek, /volume',
        '',
        'Run /wayship to control a Zeta device. Use /link to look up your Last.fm or ListenBrainz profile by username. Add `share: True` to a listening command to post its result in the channel.',
    ].join('\n');
}

export function interactions({ accounts, scrobbling, wayship }) {
    async function playing(profile, requested, device) {
        if (requested && device) throw new BotError('Choose a listening service or a Zeta device.');
        const lookups = (requested ? [pickService(profile, requested)] : Object.keys(services).filter((key) => profile[key]))
            .map((service) => scrobbling.recent(service, profile[service], 1, true)
                .then((tracks) => tracks.map((track) => ({ ...track, service }))));
        // Settle scrobbler lookups immediately while Wayship checks connected devices.
        const scrobbles = Promise.allSettled(lookups);
        let zeta = null;
        let wayshipError;
        if (!requested && (profile.wayship || device)) {
            try {
                zeta = await wayship.run(profile.wayship?.token, { action: 'status' }, device);
            } catch (error) {
                wayshipError = error;
            }
        }
        if (device && wayshipError) throw wayshipError;
        if (zeta?.result.playback.track && (device || zeta.result.playback.phase !== 'paused')) return playbackLabel(zeta);

        const history = await scrobbles;
        const items = history.flatMap((entry) => entry.status === 'fulfilled' ? entry.value : []);
        const active = items.find(({ playing }) => playing);
        if (active) return `**Now playing**\n${trackLabel(active)}\n${services[active.service]}`;
        if (zeta?.result.playback.track) return playbackLabel(zeta);
        const latest = items.sort((a, b) => b.time - a.time)[0];
        if (latest) {
            const time = latest.time > 0 && latest.time < 10_000_000_000 ? ` · <t:${Math.floor(latest.time)}:R>` : '';
            return `**Last played**\n${trackLabel(latest)}\n${services[latest.service]}${time}`;
        }
        if (zeta) return playbackLabel(zeta);
        if (requested && history[0]?.status === 'rejected') throw history[0].reason;
        if (wayshipError) throw wayshipError;
        if (!lookups.length) throw new BotError('Connect Zeta with /wayship or link a listening profile with /link.');
        if (history.every(({ status }) => status === 'rejected')) throw history[0].reason;
        return 'No listening activity found.';
    }

    async function handleCommand(interaction, profile) {
        const { commandName, options, user } = interaction;
        const requested = options.getString('service');
        const device = options.getString('device');
        const token = profile.wayship?.token;

        switch (commandName) {
            case 'help':
                return help();
            case 'profile': {
                const links = Object.keys(services).filter((service) => profile[service]).map((service) =>
                    `**${services[service]}** · [${clean(profile[service])}](<${profileUrl(service, profile[service])}>)`);
                if (profile.wayship) links.push(`**Wayship** · @${clean(profile.wayship.handle)}`);
                return links.length ? links.join('\n') : 'Use /link or /wayship to connect an account.';
            }
            case 'link': {
                const name = options.getString('username', true).trim();
                if (!name || /[\x00-\x1f\x7f]/.test(name) || (requested === 'lastfm' && !/^[a-z\d_-]+$/i.test(name))) {
                    throw new BotError('Enter a profile username.');
                }
                const username = await scrobbling.verify(requested, name);
                accounts.set(user.id, requested, username);
                return `Linked **${services[requested]}** as **${clean(username)}**.`;
            }
            case 'unlink':
                if (!profile[requested]) return 'That service is already disconnected.';
                accounts.set(user.id, requested, null);
                return requested === 'wayship'
                    ? 'Wayship connection removed. You can revoke the Discord Bot connection from Wayship’s Connected apps page.'
                    : `${services[requested]} profile removed.`;
            case 'playing':
                return playing(profile, requested, device);
            case 'recent': {
                const service = pickService(profile, requested);
                const tracks = (await scrobbling.recent(service, profile[service], 5)).filter(({ playing }) => !playing);
                const lines = numberList(tracks, (track) => trackLabel(track, 75));
                return lines ? `**Recent listens · ${services[service]}**\n${lines}` : 'No recent listens found.';
            }
            case 'toptracks': case 'topartists': {
                const kind = commandName === 'toptracks' ? 'tracks' : 'artists';
                const service = pickService(profile, requested);
                const period = options.getString('period') ?? 'month';
                const items = await scrobbling.top(service, profile[service], kind, period);
                const lines = numberList(items, (track) => `${trackLabel(track, 65)} · ${Number(track.count) || 0} plays`);
                return lines ? `**Top ${kind} · ${periods[period].name} · ${services[service]}**\n${lines}` : 'No top-list data for that period yet.';
            }
            case 'devices': {
                const devices = await wayship.devices(token);
                if (!devices.length) return 'No Zeta devices are online. Open Zeta and connect to Wayship.';
                const lines = devices.slice(0, 8).map(({ id, name, playback }) => {
                    const status = playback?.phase ?? 'no reply';
                    const role = playback && !playback.controllable ? ' · following another player' : '';
                    return `**${clean(name, 60)}** · ${status}${role}\n\`${id}\``;
                });
                if (devices.length > 8) lines.push(`…and ${devices.length - 8} more. Select by device name.`);
                return lines.join('\n');
            }
            case 'queue': {
                const { name, result } = await wayship.run(token, { action: 'status' }, device);
                const lines = numberList(result.playback.queue, (track) => trackLabel(track, 75));
                return lines ? `**Up next on ${clean(name, 60)}**\n${lines}` : `The queue on **${clean(name, 60)}** is empty.`;
            }
        }

        if (!Object.hasOwn(transport, commandName)) throw new BotError('Unknown Zeta command.');
        const song = options.getString('song')?.trim();
        if (['play', 'playnext', 'enqueue'].includes(commandName) && !song) throw new BotError('Enter a song title and artist.');
        const value = options.getInteger('percent') ?? options.getInteger('seconds');
        const { name, result } = await wayship.run(token, {
            action: commandName,
            ...(song && { query: song }),
            ...(value !== null && { value }),
        }, device);
        const target = `**${clean(name, 60)}**`;

        switch (commandName) {
            case 'play': return `Selected **${trackLabel(result.track)}** for playback on ${target}.`;
            case 'playnext': return `Sent **${trackLabel(result.track)}** to play next on ${target}.`;
            case 'enqueue': return `Added **${trackLabel(result.track)}** to the queue on ${target}.`;
            case 'skip': return `Skipped on ${target}.`;
            case 'previous': return `Went back on ${target}.`;
            case 'pause': return `Paused on ${target}.`;
            case 'unpause': return `Resumed on ${target}.`;
            case 'seek': return `Seek sent to ${target} at **${clock(value)}**.`;
            case 'volume': return `Volume set to **${value}%** on ${target}.`;
            case 'lyrics': {
                const title = `**Lyrics for ${trackLabel(result.track)}**`;
                const text = escapeMarkdown(result.lyrics);
                if ((title + text).length <= 1890) return `${title}\n\n${text}`;
                return { ...replyOptions(title), files: [new AttachmentBuilder(Buffer.from(result.lyrics), { name: 'lyrics.txt' })] };
            }
        }
    }

    return async function onInteraction(interaction) {
        try {
            if (interaction.isButton() && interaction.customId === CONNECT_BUTTON) {
                await interaction.showModal(tokenModal());
                return;
            }
            if (interaction.isModalSubmit() && interaction.customId === CONNECT_MODAL) {
                await interaction.deferReply({ flags: PRIVATE });
                const connection = await wayship.verify(interaction.fields.getTextInputValue('token').trim());
                accounts.set(interaction.user.id, 'wayship', connection);
                await interaction.editReply(replyOptions(`Connected to Wayship as **@${clean(connection.handle)}**. Try /devices or /playing.`));
                return;
            }
            if (!interaction.isChatInputCommand()) return;

            const profile = accounts.get(interaction.user.id);
            if (interaction.commandName === 'wayship') {
                await interaction.reply(wayshipPrompt(profile.wayship?.handle));
                return;
            }

            await interaction.deferReply(interaction.options.getBoolean('share') ? {} : { flags: PRIVATE });
            const result = await handleCommand(interaction, profile);
            await interaction.editReply(typeof result === 'string' ? replyOptions(result) : result);
        } catch (error) {
            // Avoid logging HTTP bodies or modal input that could contain a token.
            if (!(error instanceof BotError)) console.error('Discord interaction failed', error.name, error.code ?? '');
            const message = error instanceof BotError ? clean(error.message, 450) : 'Zeta could not finish that command. Try again.';
            await (interaction.deferred
                ? interaction.editReply(replyOptions(message))
                : interaction.reply({ ...replyOptions(message), flags: PRIVATE | TEXT_FLAGS })).catch(() => {});
        }
    };
}
