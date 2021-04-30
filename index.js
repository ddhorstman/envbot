import { WebClient } from "@slack/web-api";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

async function main() {
  // Read config
  const { ENV_BOT_CHANNEL, ENV_BOT_SLACK_BOT_TOKEN } = process.env;
  if (!(ENV_BOT_CHANNEL && ENV_BOT_SLACK_BOT_TOKEN)) {
    throw new Error(
      `Missing config - be sure your '.env' file contains both 'ENV_BOT_CHANNEL' and 'ENV_BOT_SLACK_BOT_TOKEN'.`
    );
  }
  const slack = new WebClient(ENV_BOT_SLACK_BOT_TOKEN);

  // Read contents of current .env
  const newFile = fs.readFileSync(".env").toString();
  /**
   * Upload the new file
   */
  const upload = () =>
    slack.files.upload({
      filename: Date.now().toString(),
      content: newFile,
      filetype: "shell",
      channels: ENV_BOT_CHANNEL,
      initial_comment: "<!channel> `.env` files have been updated!",
    });

  // Upload a test file to determine our user_id and the channel_id
  const testUpload = await slack.files
    .upload({
      filename: Date.now().toString(),
      content: "Hello world",
      channels: ENV_BOT_CHANNEL,
    })
    .catch(() => {
      throw new Error(
        `Could not find '${ENV_BOT_CHANNEL}' - make sure you've added 'envbot' to it and given it 'files:read' and 'files:write' scopes!`
      );
    });
  const testFile = testUpload.file;
  const fileInfoRequest = await slack.files.info({ file: testFile.id });
  const fileInfo = fileInfoRequest.file;
  const channelId = fileInfo?.channels?.[0] ?? fileInfo?.groups?.[0];
  const userId = testFile?.user;
  await slack.files.delete({ file: testFile.id });

  if (!(channelId && userId)) {
    throw new Error(
      `An unknown error ocurred while trying to find the channel id.`
    );
  }

  // Find the most recent file this bot uploaded to the channel
  let existingFiles = [],
    page = 1,
    done = false;
  while (!done) {
    const filesRequest = await slack.files.list({
      channel: channelId,
      user: userId,
      page,
    });
    const files = filesRequest.files;
    // Stop the loop when we have no more files
    if (!files?.length) done = true;
    else {
      existingFiles = files;
      page++;
    }
  }
  const mostRecentFile = existingFiles?.[existingFiles?.length - 1];
  if (!mostRecentFile) {
    console.log(
      "No previous .env files found in this channel - uploading a new one!"
    );
    return upload();
  }

  // If we've uploaded before, compare the files
  const infoRequest = await slack.files.info({ file: mostRecentFile.id });
  const oldFile = infoRequest.content;
  if (oldFile !== newFile) {
    console.log("Uploading updated .env file!");
    return upload();
  }
  console.log(".env file was found and is up to date!");
}

main().catch(console.log);
