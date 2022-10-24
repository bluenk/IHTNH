import { EmbedBuilder as DefaultMessageEmbed, APIEmbed } from "discord.js";

export default class EmbedBuilder extends DefaultMessageEmbed {
    public constructor(option?: APIEmbed) {
        super(option)
        if (!option?.color) this.setColor('#FF9C33');
    }

    public showVersion() {
        return this.setFooter({ text: `IHTNH v${process.env.npm_package_version}` });
    }
}