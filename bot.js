const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('./config');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ] 
});

client.once('ready', () => {
    console.log(`✨ Moonlit Promise Bot is online as ${client.user.tag} ✨`);
});

client.login(config.BOT_TOKEN);

module.exports = {
    sendLoginLog: (userData) => {
        const channel = client.channels.cache.get(config.LOGIN_LOG_CHANNEL);
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setTitle('🌙 New Moonlit Visitor')
            .setDescription(`A new soul has entered the realm of Moonlit Promise`)
            .setColor(0x9b59b6)
            .addFields(
                { name: 'Discord ID', value: userData.id, inline: true },
                { name: 'Username', value: userData.username, inline: true },
                { name: 'Time', value: new Date().toLocaleString(), inline: true }
            )
            .setThumbnail(`https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`)
            .setFooter({ text: 'Moonlit Promise • Where dreams come true' })
            .setTimestamp();
        
        channel.send({ content: `<@${userData.id}> just arrived under the moonlight ✨`, embeds: [embed] });
    },
    
    sendPaymentLog: (user, cartItems, proofFile, address, phone, fullName) => {
        const channel = client.channels.cache.get(config.PAYMENT_LOG_CHANNEL);
        if (!channel) return;
        
        const itemsList = cartItems.map(item => `• ${item.name} - $${item.price}`).join('\n');
        const total = cartItems.reduce((sum, item) => sum + item.price, 0);
        
        const embed = new EmbedBuilder()
            .setTitle('💜 New Payment Proof Submitted')
            .setDescription(`A customer has completed their purchase under the moonlight`)
            .setColor(0x9b59b6)
            .addFields(
                { name: 'Customer', value: user.username, inline: true },
                { name: 'Full Name', value: fullName, inline: true },
                { name: 'Phone', value: phone, inline: true },
                { name: 'Address', value: address, inline: false },
                { name: 'Items Purchased', value: itemsList, inline: false },
                { name: 'Total', value: `$${total}`, inline: true },
                { name: 'Proof File', value: proofFile, inline: true }
            )
            .setImage(`attachment://${proofFile}`)
            .setFooter({ text: 'Moonlit Promise • Awaiting approval' })
            .setTimestamp();
        
        channel.send({ 
            content: `<@${user.id}> has shared their payment proof under the moonlight ✨`,
            embeds: [embed],
            files: [{
                attachment: `./public/uploads/${proofFile}`,
                name: proofFile
            }]
        });
    },
    
    sendApprovalLog: (order) => {
        const channel = client.channels.cache.get(config.APPROVED_LOG_CHANNEL);
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setTitle('✨ Order Approved ✨')
            .setDescription(`A promise has been fulfilled under the moonlight`)
            .setColor(0xf1c40f)
            .addFields(
                { name: 'Customer', value: order.username, inline: true },
                { name: 'Product', value: order.productName, inline: true },
                { name: 'Order ID', value: order.id.toString(), inline: true }
            )
            .setFooter({ text: 'Moonlit Promise • A new dream begins' })
            .setTimestamp();
        
        channel.send({ 
            content: `<@${order.userId}> your order has been blessed by the moonlight! ✨`,
            embeds: [embed] 
        });
    },
    
    giveRole: async (userId, username) => {
        try {
            // Find the first guild the bot is in (you might want to specify a guild ID)
            const guild = client.guilds.cache.first();
            if (!guild) return;
            
            const member = await guild.members.fetch(userId);
            if (!member) return;
            
            const roleId = config.AUTO_ROLE_ID;
            await member.roles.add(roleId);
            
            console.log(`✨ Granted Moonlit Promise role to ${username} ✨`);
        } catch (error) {
            console.error('Error giving role:', error);
        }
    }
};
