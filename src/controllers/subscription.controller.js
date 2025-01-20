import mongoose, { isValidObjectId } from "mongoose";
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { uploadToCloudinary } from "../utils/cloudinary.js"
import { deleteOnCloudinary } from "../utils/cloudinary.js"
import { Video } from "../models/video.model.js"
import { Subscription } from "../models/subscription.model.js"

const toggleSubscription = asyncHandler(async (req,res) => {
    const {channelId} = req.params

    if(!isValidObjectId(channelId)){
        throw new ApiError(400, "Invalid Channel Id")
    }

    const isSubscribed = await Subscription.findOne({
        subscriber: req.user?._id,
        channel: channelId
    })

    if(isSubscribed){
        await Subscription.findByIdAndDelete(isSubscribed?._id);
    
    return res
    .status(200)
    .json(new ApiResponse(200, {subscribed: false}, "Channel unsubscribed successfully"))
    }

    await Subscription.create({
        subscriber: req.user?._id,
        channel: channelId
    });

    return res
    .status(200)
    .json(new ApiResponse(200, {subscribed: true}, "Subscribed Successfully"))
}) 



export {toggleSubscription}