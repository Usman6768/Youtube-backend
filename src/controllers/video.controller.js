import mongoose, { isValidObjectId } from "mongoose";
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { uploadToCloudinary } from "../utils/cloudinary.js"
import { deleteOnCloudinary } from "../utils/cloudinary.js"
import { Video } from "../models/video.model.js"

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

    let pipeline = [
        {
            $match: {
                $or: [
                    {
                        owner: new mongoose.Types.ObjectId(userId)
                    },
                    {
                        $or: [
                            {
                                title: {
                                    $regex: query ? query : "",
                                    $options: "i",
                                },
                            },
                            {
                                description: {
                                    $regex: query ? query : "",
                                    $options: "i",
                                }
                            }
                        ]
                    }
                ]
            }
        },
        {
            $lookup: {
                from: "users",
                localField: "owner",
                forignField: "_id",
                as: "ownerDetails",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            avatar: 1,
                        }
                    }
                ]
            }
        },
        {
            $addFields: {
                ownerDetails: {
                    $arrayElement: ["$ownerDetails", 0],
                }
            }
        },
        {
            $project: {
                ownerDetails: 1,
                createdAt: 1,
                view: 1,
                title: 1,
                videoFile: 1,
                thumbnail: 1
            },
        },
    ];

     // end of pipeline

    if( sortBy && sortType ){
        let sortStage = {
            $sort: {
                [sortBy] : sortType.toLowerCase() === 'desc' ? -1 : 1 
            }
        }

    pipeline.push(sortStage)
    }

    else {
        // Default sorting by createdAt in ascending order if sortBy and sortType are not provided
        pipeline.push({
            $sort: {
                createdAt: 1
            }
        });
    }


    // add pagination stages
    let skipStage = {
        $skip: ( page - 1 ) * limit
    }

    let limitStage = {
        $limit: limit
    }

    pipeline.push(skipStage,limitStage)

    const video = await Video.aggregate(pipeline)

    if(!video?.length){
        throw new ApiError(400, "No videos found")
    }

    return res
    .status(200)
    .json(new ApiResponse(200, video, "Videos fetched Successfully"))

})

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body;

    if ([title, description].some((field) => field?.trim() === "")) {
        throw new ApiError(401, "All Fields are required")
    }

    const videoFileLocalPath = req.files?.videoFile[0].path;
    const thumbnailLocalPath = req.files?.thumbnail[0].path;

    if (!videoFileLocalPath) {
        throw new ApiError(400, "VideoFileLocalPath is required")
    }

    if (!thumbnailLocalPath) {
        throw new ApiError(400, "ThumbnailLocalPath is required")
    }

    const videoFile = await uploadToCloudinary(videoFileLocalPath);
    const thumbnail = await uploadToCloudinary(thumbnailLocalPath);

    if (!videoFile) {
        throw new ApiError(401, "Video failed to upload on cloudinary")
    }

    if (!thumbnail) {
        throw new ApiError(401, "Thumbnail failed to upload on cloudinary")
    }

    const video = await Video.create({
        title,
        description,
        duration: videoFile.duration,
        videoFile: {
            url: videoFile.url,
            public_id: videoFile.public_id
        },
        thumbnail: {
            url: thumbnail.url,
            public_id: thumbnail.public_id
        },
        owner: req.user?._id,
        isPublished: false
    })

    const videoUploaded = await Video.findById(video._id);

    if (!videoUploaded) {
        throw new ApiError(500, "Video failed to upload, Please Try Again..")
    }

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Video Uploaded successfully"))

});

const updateVideo = asyncHandler(async (req, res) => {
    const { title, description } = req.body;
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(401, "Invalid VideoId")
    }

    if (!(title && description)) {
        throw new ApiError(400, "Title and description are required")
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(400, "No Video found")
    }

    if (video.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(400, "you cannot edit this video as you are not the owner")
    }

    const thumbnailToDelete = video.thumbnail.public_id

    const thumbnailLocalPath = req.files?.path

    if (!thumbnailLocalPath) {
        throw new ApiError(400, "Thumbnail is required")
    }

    const thumbnail = await uploadToCloudinary(thumbnailLocalPath)

    if (!thumbnail) {
        throw new ApiError(400, "Thumbnail not found")
    }

    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                title,
                description,
                thumbnail: {
                    public_id: thumbnail.public_id,
                    url: thumbnail.url
                }
            }
        },
        { new: true }
    )

    if (!updatedVideo) {
        throw new ApiError(500, "Failed to update, Please try again");
    }

    if (updatedVideo) {
        await deleteOnCloudinary(thumbnailToDelete)
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedVideo, "Video updated successfully"))
})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid Video Id")
    }

    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(400, "No video found")
    }

    if (video?.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(400, "You cannot delete the video as you are not the owner")
    }

    const videoToDelete = await Video.findByIdAndDelete(video?._id)

    await deleteOnCloudinary(video.thumbnail.public_id);
    await deleteOnCloudinary(video.videoFile.public_id, "video");

    // delete video likes
    await Like.deleteMany({
        video: videoId
    })

    // delete video comments
    Comment.deleteMany({
        video: videoId
    })

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Video deleted Successfully"));

});

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid Video id")
    }

    const video = await Video.findById(videoId)

    if (!video) {
        throw new ApiError(400, "Video not found")
    }

    if (video?.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(400, "You cannot update the publish status as you are not the owner")
    }

    const toggleVideoStatus = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                isPublished: !video?.isPublished
            }
        },
        { new: true }
    );

    if (!toggleVideoStatus) {
        throw new ApiError(500, "Failed to toggle video publish status")
    }


    return res
        .status(200)
        .json(new ApiResponse(
            200,
            { isPublished: toggleVideoStatus.isPublished },
            "Video published toggled successfully"
        ))
});

// const getVideoById = asyncHandler(async (req,res) => {
//     const {videoId} = req.params

//     if(!isValidObjectId(videoId)){
//         throw new ApiError(401, "Invalid VideoId")
//     }

//     if(!isValidObjectId(req.user?._id)){
//         throw new ApiError(401, "Invalid User Id")
//     }

// })
