const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const projectBuildingSchema = new Schema({

    project: {
        type: Schema.Types.ObjectId,
        ref: 'Newprojects',
        required: true
    },
    buildingName: {
        type: String,
        required: true,
        trim: true
    }, // e.g. "Tower A", "Block B", "Villa Cluster"
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: { type: Date, default: Date.now },   
    updatedAt: { type: Date, default: Date.now }

}, { timestamps: true });

projectBuildingSchema.index({ project: 1, isActive: 1 });

const ProjectBuilding = model('ProjectBuilding', projectBuildingSchema);
module.exports = ProjectBuilding;