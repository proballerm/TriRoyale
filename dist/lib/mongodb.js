"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongodb_1 = require("mongodb");
const uri = process.env.MONGODB_URI;
if (!uri)
    throw new Error("MONGODB_URI not defined");
let client = new mongodb_1.MongoClient(uri);
let clientPromise;
if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
        global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
}
else {
    clientPromise = client.connect();
}
exports.default = clientPromise;
