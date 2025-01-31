"use server";
import { revalidatePath } from "next/cache";
import { scrapeAmazonProduct } from "../scraper/index";
import { connectToDB } from "../mongoosedb";
import Product from "../models/product.model";
import { getHighestPrice, getLowestPrice, getAveragePrice } from "../utils";
import { User } from "@/types";
import { generateEmailBody, sendEmail } from "@/lib/nodemailer";

export async function scrapeAndStoreProduct(productUrl: string) {
  if (!productUrl) return;

  try {
    await connectToDB();
    const scrapedProduct = await scrapeAmazonProduct(productUrl);

    if (!scrapedProduct) return;

    let product = scrapedProduct;

    const existingProduct = await Product.findOne({ url: scrapedProduct.url });

    if (existingProduct) {
      const updatedPriceHistory: any = [
        ...existingProduct.priceHistory,
        { price: scrapedProduct.currentPrice },
      ];

      product = {
        ...scrapedProduct,
        priceHistory: updatedPriceHistory,
        lowestPrice: getLowestPrice(updatedPriceHistory),
        highestPrice: getHighestPrice(updatedPriceHistory),
        averagePrice: getAveragePrice(updatedPriceHistory),
      };
    }

    const newProduct = await Product.findOneAndUpdate(
      { url: scrapedProduct.url },
      product,
      { upsert: true, new: true }
    );

    console.log(newProduct, product);

    revalidatePath(`/products/${newProduct._id}`);

    // Find or create the product in the database
  } catch (err: any) {
    throw new Error(`Failed to create/update product: ${err.message}`);
  }
}

export async function getProductById(productId: string) {
  try {
    await connectToDB();

    const product = await Product.findOne({ _id: productId });

    if (!product) return null;

    return product;
  } catch (err: any) {
    throw new Error(`Could not locate product ${err.message}`);
  }
}

export async function getAllProducts() {
  try {
    await connectToDB();

    const products = await Product.find();

    return products;
  } catch (err) {
    console.log(err);
  }
}
export async function getSimilarProducts(productId: string) {
  try {
    await connectToDB();
    const currentProduct = await Product.findById(productId);
    if (!currentProduct) return null;

    const similiarProducts = await Product.find({
      _id: { $ne: productId },
    }).limit(3);

    return similiarProducts;
  } catch (err) {
    console.log(err);
  }
}

export async function addUserEmailToProduct(
  productId: string,
  userEmail: string
) {
  try {
    const product = await Product.findById(productId);
    if (!product) return;

    const userExists = product.users.some(
      (user: User) => user.email === userEmail
    );

    if (!userExists) {
      product.users.push({ email: userEmail });
      await product.save();

      const emailContent = await generateEmailBody(product, "WELCOME");

      await sendEmail(emailContent, [userEmail]);
    }
  } catch (err) {
    console.error(err);
  }
}
