import mongoose, { isValidObjectId } from "mongoose";
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { uploadToCloudinary } from "../utils/cloudinary.js"
import { deleteOnCloudinary } from "../utils/cloudinary.js"
import { User } from "../models/user.model.js"
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

const getUserChannelSubscribers = asyncHandler(async (req,res) => {
    const {channelId} = req.params

    if(!isValidObjectId(channelId)){
        throw new ApiError(400, "Invalid Channel Id")
    }

    channelId = new mongoose.Types.ObjectId(channelId)

    const subscribers = await Subscription.aggregate([
        {
            $match: {
                channel : channelId
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "subscriber",
                foreignField: "_id",
                as: "subscriber",
                pipeline: [{
                    $lookup : {
                        from : "subscription",
                        localField: "_id",
                        foreignField: "channel",
                        as: "subscribedToSubscriber"
                    }
                },
                {
                    $addFields: {
                        subscribedToSubscriber : {
                            $cond: {
                                if: {
                                    $in: [
                                        channelId, $subscribedToSubscriber.subscriber
                                    ]
                                },
                                then : true,
                                else: false
                            }
                        },
                        subscribersCount: {
                            $size: "$subscribedToSubscriber",
                        },
                    }
                }]
            }
        },
        {
            $unwind: "$subscriber"
        },
        {
            $project: {
                _id: 0,
                subscriber: {
                    _id: 1,
                    username: 1,
                    fullName: 1,
                    "avatar.url": 1,
                    subscribedToSubscriber: 1,
                    subscribersCount: 1,
                },
            },
        }
    ])

    return res
    .status(200)
    .json(new ApiResponse(200, subscribers, "Subscribers fetched successfully"))

})

const getSubscribedChannels = asyncHandler(async (req,res) => {
    const SubscribersNumber = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user?._id)
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "ChannelSubTo"
            }
        },
        {
            $addFields: {
                ChannelSubTo: {
                    $size: "$ChannelSubTo"
                }
            }
        },
        {
            $project: {
                ChannelSubTo: 1
            }
        },
    ])

    if(!SubscribersNumber?.length){
        throw new ApiError(400, "Channel not found")
    }

    return res
    .status(200)
    .json(new ApiResponse(200, SubscribersNumber, "Channel Subscribed number fetched successfully"))
})


export {toggleSubscription, getUserChannelSubscribers, getSubscribedChannels}