const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const siteSettingsSchema = new Schema({
    // Branding
    siteName: { type: String, default: 'Property Finder' },
    logo: String,
    favicon: String,
    primaryColor: { type: String, default: '#ff0000' },
    secondaryColor: { type: String, default: '#000000' },

    // Contact
    contactEmail: String,
    contactPhone: String,
    address: String,
    social: {
        facebook: String,
        instagram: String,
        twitter: String,
        linkedin: String,
        youtube: String
    },

    // SEO Defaults
    defaultMetaTitle: String,
    defaultMetaDescription: String,
    defaultMetaKeywords: [String],

    // Legal
    termsUrl: String,
    privacyUrl: String,
    cookiesUrl: String,

    // Features
    maintenanceMode: { type: Boolean, default: false },
    allowRegistrations: { type: Boolean, default: true },
    enableEmailVerification: { type: Boolean, default: true },
    enablePhoneVerification: { type: Boolean, default: false },

    // Analytics & Integrations
    analytics: {
        googleAnalyticsId: String,
        facebookPixelId: String,
        hotjarId: String,
        other: Schema.Types.Mixed
    },

    // Notification Settings
    notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: true }
    },

    // Storage / CDN
    storage: {
        cdnUrl: String,
        assetVersion: String
    },

    // Misc
    defaultLanguage: { type: String, default: 'en' },
    supportedLanguages: [{ type: String, default: 'en' }],
    currency: { type: String, default: 'AED' },
    timezone: { type: String, default: 'Asia/Dubai' },

    // Metadata
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

// Indexes
siteSettingsSchema.index({ siteName: 1 });
siteSettingsSchema.index({ maintenanceMode: 1 });

const SiteSettings = model('SiteSettings', siteSettingsSchema);
module.exports = SiteSettings;

