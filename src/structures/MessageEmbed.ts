import { MessageEmbed as DiscordMessageEmbed, MessageEmbedOptions } from "discord.js";

export default class MessageEmbed extends DiscordMessageEmbed {
    public constructor(option?: MessageEmbedOptions) {
        super(option)
        this.setColor('#FF9C33');
    }

    public showVersion() {
        return this.setFooter({ text: `IHTNH v${process.env.npm_package_version}` });
    }
}