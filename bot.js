// bot.js - Discord bot with all logging capabilities
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('./config');
const Logger = require('./logger');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ] 
});

client.once('ready', () => {
    console.log(`✨ Moonlit Promise Bot is online as ${client.user.tag} ✨`);
    Logger.info('Discord bot initialized', { botUser: client.user.tag });
});

client.login(config.BOT_TOKEN).catch(err => {
    Logger.error('Discord bot login failed', err);
});

const DiscordLogger = {
    /**
     * LOGIN LOG - When user logs in
     */
    async sendLoginLog(userData, ip = 'Unknown') {
        const channel = client.channels.cache.get(config.LOGIN_LOG_CHANNEL);
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setTitle('🌙 New Login - Moonlit Promise')
            .setColor(0x9b59b6)
            .setThumbnail(`https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`)
            .addFields(
                { name: 'User', value: `<@${userData.id}>`, inline: true },
                { name: 'Username', value: userData.username, inline: true },
                { name: 'Discord ID', value: userData.id, inline: true },
                { name: 'IP Address', value: ip, inline: true },
                { name: 'Time', value: new Date().toLocaleString('en-IN'), inline: true },
                { name: 'User Agent', value: 'Web Browser', inline: true }
            )
            .setFooter({ text: 'Moonlit Promise • Login Log' })
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        Logger.login(userData.id, userData.username, ip, { avatar: userData.avatar });
    },

    /**
     * ORDER LOG - When new order is placed
     */
    async sendOrderLog(order, user, items) {
        const channel = client.channels.cache.get(config.ORDER_LOG_CHANNEL);
        if (!channel) return;
        
        const itemsList = items.map(item => 
            `• **${item.name}** - ${config.CURRENCY}${item.price} x${item.quantity || 1}`
        ).join('\n');
        
        const trackingUrl = `${config.BASE_URL}/track/${order.orderNumber}`;
        
        const embed = new EmbedBuilder()
            .setTitle('📦 New Order Placed')
            .setColor(0x3498db)
            .setThumbnail(`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`)
            .addFields(
                { name: 'Order Number', value: order.orderNumber, inline: true },
                { name: 'Customer', value: `<@${user.id}>`, inline: true },
                { name: 'Full Name', value: order.fullName, inline: true },
                { name: 'Phone', value: order.phone, inline: true },
                { name: 'Amount', value: `${config.CURRENCY}${order.totalAmount}`, inline: true },
                { name: 'Payment Method', value: order.paymentMethod.toUpperCase(), inline: true },
                { name: 'Address', value: `${order.address}, ${order.pincode}`, inline: false },
                { name: 'Items', value: itemsList.substring(0, 1024) || 'No items', inline: false },
                { name: 'Track Order', value: `[Click Here](${trackingUrl})`, inline: true }
            )
            .setFooter({ text: `Order ID: ${order.id} • ${new Date().toLocaleString('en-IN')}` })
            .setTimestamp();
        
        await channel.send({ 
            content: `🆕 **New Order from ${order.fullName}**`,
            embeds: [embed] 
        });
        
        Logger.orderCreated(order.orderNumber, user.id, order.totalAmount, items, {
            address: order.address,
            pincode: order.pincode,
            phone: order.phone
        });
    },

    /**
     * PAYMENT LOG - Payment confirmation
     */
    async sendPaymentLog(order, user, paymentDetails) {
        const channel = client.channels.cache.get(config.PAYMENT_LOG_CHANNEL);
        if (!channel) return;
        
        const color = paymentDetails.status === 'completed' ? 0x2ecc71 : 0xf1c40f;
        const title = paymentDetails.status === 'completed' ? '✅ Payment Completed' : '⏳ Payment Pending';
        
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setThumbnail(`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`)
            .addFields(
                { name: 'Order Number', value: order.orderNumber, inline: true },
                { name: 'Customer', value: `<@${user.id}>`, inline: true },
                { name: 'Amount', value: `${config.CURRENCY}${order.totalAmount}`, inline: true },
                { name: 'Payment Method', value: order.paymentMethod.toUpperCase(), inline: true },
                { name: 'Status', value: paymentDetails.status, inline: true },
                { name: 'Transaction ID', value: paymentDetails.transactionId || 'N/A', inline: true },
                { name: 'Payment Time', value: new Date().toLocaleString('en-IN'), inline: true }
            )
            .setFooter({ text: 'Moonlit Promise • Payment Log' })
            .setTimestamp();
        
        if (paymentDetails.utrNumber) {
            embed.addFields({ name: 'UTR Number', value: paymentDetails.utrNumber, inline: true });
        }
        
        await channel.send({ embeds: [embed] });
        
        if (paymentDetails.status === 'completed') {
            Logger.paymentCompleted(
                order.orderNumber, 
                order.totalAmount, 
                order.paymentMethod,
                paymentDetails.transactionId || paymentDetails.utrNumber,
                user.id
            );
        } else {
            Logger.paymentInitiated(
                order.orderNumber,
                order.totalAmount,
                order.paymentMethod,
                user.id
            );
        }
    },

    /**
     * DELIVERY LOG - Delivery status updates
     */
    async sendDeliveryLog(order, user, deliveryStatus) {
        const channel = client.channels.cache.get(config.DELIVERY_LOG_CHANNEL);
        if (!channel) return;
        
        let color, title, emoji;
        switch(deliveryStatus.status) {
            case 'shipped':
                color = 0x3498db;
                title = '🚚 Order Shipped';
                emoji = '📦';
                break;
            case 'out_for_delivery':
                color = 0xf39c12;
                title = '🛵 Out for Delivery';
                emoji = '🛵';
                break;
            case 'delivered':
                color = 0x2ecc71;
                title = '✅ Order Delivered';
                emoji = '🎉';
                break;
            case 'failed':
                color = 0xe74c3c;
                title = '❌ Delivery Failed';
                emoji = '⚠️';
                break;
            default:
                color = 0x95a5a6;
                title = '📋 Delivery Update';
                emoji = '📋';
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`${emoji} ${title}`)
            .setColor(color)
            .setThumbnail(`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`)
            .addFields(
                { name: 'Order Number', value: order.orderNumber, inline: true },
                { name: 'Customer', value: `<@${user.id}>`, inline: true },
                { name: 'Full Name', value: order.fullName, inline: true },
                { name: 'Phone', value: order.phone, inline: true },
                { name: 'Delivery Status', value: deliveryStatus.status, inline: true },
                { name: 'Address', value: `${order.address}, ${order.pincode}`, inline: false }
            );
        
        if (deliveryStatus.trackingId) {
            embed.addFields({ name: 'Tracking ID', value: deliveryStatus.trackingId, inline: true });
        }
        
        if (deliveryStatus.estimatedDelivery) {
            embed.addFields({ name: 'Estimated Delivery', value: deliveryStatus.estimatedDelivery, inline: true });
        }
        
        if (deliveryStatus.deliveredAt) {
            embed.addFields({ name: 'Delivered At', value: deliveryStatus.deliveredAt, inline: true });
        }
        
        embed.setFooter({ text: `Updated: ${new Date().toLocaleString('en-IN')}` })
            .setTimestamp();
        
        await channel.send({ 
            content: `${emoji} **Delivery Update for Order ${order.orderNumber}**`,
            embeds: [embed] 
        });
        
        switch(deliveryStatus.status) {
            case 'shipped':
                Logger.deliveryInitiated(order.orderNumber, order.address, user.id, deliveryStatus);
                break;
            case 'out_for_delivery':
                Logger.deliveryOutForDelivery(order.orderNumber, deliveryStatus.courier, deliveryStatus.trackingId);
                break;
            case 'delivered':
                Logger.deliveryDelivered(order.orderNumber, order.fullName, deliveryStatus.deliveredAt);
                break;
            case 'failed':
                Logger.deliveryFailed(order.orderNumber, deliveryStatus.reason);
                break;
        }
    },

    /**
     * ADMIN LOG - Admin actions
     */
    async sendAdminLog(admin, action, details, targetUser = null) {
        const channel = client.channels.cache.get(config.ADMIN_LOG_CHANNEL);
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setTitle('🔧 Admin Action')
            .setColor(0xe74c3c)
            .setThumbnail(`https://cdn.discordapp.com/avatars/${admin.id}/${admin.avatar}.png`)
            .addFields(
                { name: 'Admin', value: `<@${admin.id}>`, inline: true },
                { name: 'Action', value: action, inline: true },
                { name: 'Time', value: new Date().toLocaleString('en-IN'), inline: true },
                { name: 'Details', value: details, inline: false }
            );
        
        if (targetUser) {
            embed.addFields({ name: 'Target User', value: `<@${targetUser.id}> (${targetUser.username})`, inline: true });
        }
        
        embed.setFooter({ text: 'Moonlit Promise • Admin Log' })
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        
        Logger.adminAction(admin.id, admin.username, action, { details, targetUser });
    },

    /**
     * ADDRESS CONFIRMATION LOG
     */
    async sendAddressConfirmationLog(order, user) {
        const channel = client.channels.cache.get(config.ORDER_LOG_CHANNEL);
        if (!channel) return;
        
        const embed = new EmbedBuilder()
            .setTitle('📍 Address Confirmed')
            .setColor(0x3498db)
            .addFields(
                { name: 'Order', value: order.orderNumber, inline: true },
                { name: 'Customer', value: `<@${user.id}>`, inline: true },
                { name: 'Full Name', value: order.fullName, inline: true },
                { name: 'Phone', value: order.phone, inline: true },
                { name: 'Address', value: order.address, inline: false },
                { name: 'Pincode', value: order.pincode, inline: true },
                { name: 'Verified At', value: new Date().toLocaleString('en-IN'), inline: true }
            )
            .setFooter({ text: 'Address verification completed' })
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
    }
};

module.exports = DiscordLogger;
