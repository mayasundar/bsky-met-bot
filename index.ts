import bsky from '@atproto/api';
const { BskyAgent } = bsky;
import * as dotenv from 'dotenv';
import process from 'node:process';
dotenv.config();
import fs from 'fs';

const agent = new BskyAgent({
  service: 'https://bsky.social',
});

await agent.login({
  identifier: process.env.BSKY_IDENTIFIER!,
  password: process.env.BSKY_PASSWORD!,
});

const POLLING_INTERVAL= 1800000;
const API_ENDPOINT = 'https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=painting';
const POSTED = 'posted.txt'
async function getImg(): Promise<void>{
  try{
    const response = await fetch(API_ENDPOINT);
    if (response.ok){
      const data = await response.json();
      // get a random index from the array of object IDs
      const postedIDs = new Set(fs.readFileSync(POSTED, 'utf8').split('\n'));      
      const randomIndex = Math.floor(Math.random() * data.objectIDs.length);
      const randomID = data.objectIDs[randomIndex];
      if (!postedIDs.has(randomID.toString())) {
        // fetch object response (has media, artist + art data)
        const objResponse = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${randomID}`);
        if (objResponse.ok) {
          const objData = await objResponse.json();
          const {primaryImageSmall, artistDisplayName, title, medium, objectDate, objectURL} = objData;
          // don't allow unknown/anonymous artists, or objects with no small image
          if (primaryImageSmall && primaryImageSmall !== "" && artistDisplayName && artistDisplayName !== "" && objectDate !== "" && medium !== "" && title !== ""  && artistDisplayName !== "anonymous" && artistDisplayName !== "unknown") {
            const postDescription = `${artistDisplayName}, ${title}, ${medium}, ${objectDate}\n`;
              
            // convert image to blob
            const res = await fetch(primaryImageSmall);
            if (res.ok) {
              const thumb = await res.blob();
              postedIDs.add(randomID.toString());
              fs.appendFileSync(POSTED, `${randomID}\n`);

              const uploadRes = await fetch("https://bsky.social/xrpc/com.atproto.repo.uploadBlob", {
                method: "POST",
                body: thumb,
                headers: {
                  "Content-Type": "image/jpeg",
                  Authorization: `Bearer ${agent.session!.accessJwt}`,
                },
              });

              const {blob} = await uploadRes.json();

              // finally, make the post
              await agent.post({
                text: postDescription,

                embed: {
                  $type: 'app.bsky.embed.images',
                  images: [{image: blob, alt: postDescription}],
                },
                });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching data:', error);
  }
  setTimeout(getImg, POLLING_INTERVAL);
}
getImg();
