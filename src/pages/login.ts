import fs from "node:fs";

import prompt from "prompt";
prompt.start();  // Initialize prompt (this should only be called once!)

import puppeteer, {TimeoutError} from "puppeteer";

import {TwitchPage} from "./page.js";
import logger from "../logger.js";

async function asyncPrompt(schema: any) {
    return new Promise((resolve, reject) => {
        prompt.get(schema, (error: any, result: any) => {
            if (error) {
                reject(error);
            }
            resolve(result);
        });
    });
}

export class LoginPage extends TwitchPage {

    async login(username?: string, password?: string, headless: boolean = false, timeout?: number) {
        if (timeout) {
            this.page.setDefaultTimeout(1000 * timeout);
        }

        // Throw an error if the page is closed for any reason
        const onPageClosed = () => {
            throw new Error("Page closed!");
        }
        this.page.on("close", onPageClosed);

        // Go to login page
        await this.page.goto("https://www.twitch.tv/login");

        // Enter username
        if (username !== undefined) {
            await this.page.focus("#login-username");
            await this.page.keyboard.type(username);
        }

        // Enter password
        if (password !== undefined) {
            await this.page.focus("#password-input");
            await this.page.keyboard.type(password);
        }

        // Click login button
        if (username !== undefined && password !== undefined) {
            await this.page.click('[data-a-target="passport-login-button"]');
        }

        const waitForCookies = async (timeout?: number) => {
            // Maximum amount of time we should wait for the required cookies to be created. If they haven't been created within this time limit, consider the login a failure.
            const MAX_WAIT_FOR_COOKIES_SECONDS = timeout ?? 30;

            // Wait until the required cookies have been created
            const startTime = new Date().getTime();
            while (true) {

                if (timeout !== 0 && new Date().getTime() - startTime >= 1000 * MAX_WAIT_FOR_COOKIES_SECONDS) {
                    throw new Error("Timed out while waiting for cookies to be created!");
                }

                const requiredCookies = new Set(["auth-token", "persistent", "login"]);
                const cookies = await this.page.cookies();
                let allExists = true;
                for (const requiredCookie of requiredCookies) {
                    let exists = false;
                    for (const cookie of cookies) {
                        if (cookie["name"] === requiredCookie) {
                            exists = true;
                            break
                        }
                    }
                    if (!exists) {
                        allExists = false;
                        break;
                    }
                }
                if (allExists) {
                    break;
                }

                logger.info("Waiting for cookies to be created...");
                await this.page.waitForTimeout(3000);
            }
        }

        if (headless) {
            while (true) {

                // Check for email verification code
                try {
                    logger.info("Checking for email verification...");
                    await this.page.waitForXPath('//*[contains(text(), "please enter the 6-digit code we sent")]');
                    logger.info("Email verification found.");

                    // Prompt user for code
                    let code = null;
                    while (true) {
                        // Prompt for input
                        console.log("Enter the code from the email or 'r' to resend the email.")
                        const result: any = await asyncPrompt(["code"]);
                        code = result["code"];
                        if (code === 'r') {
                            // Resend
                            const resendCodeButton = await this.page.waitForXPath("//button[contains(text(), 'Resend code')]");
                            if (resendCodeButton === null) {
                                logger.error("Failed to resend code!");
                                continue;
                            }
                            logger.info("Resent verification email");
                            await ((resendCodeButton) as puppeteer.ElementHandle<Element>).click();
                        } else {
                            break;
                        }
                    }

                    // Enter code
                    const first_input = await this.page.waitForXPath("(//input)[1]");
                    if (first_input == null) {
                        logger.error("first_input was null!");
                        break
                    }
                    await ((first_input) as puppeteer.ElementHandle<Element>).click();
                    await this.page.keyboard.type(code);
                    break;
                } catch (error) {
                    if (error instanceof TimeoutError) {
                        logger.info("Email verification not found.");
                    } else {
                        logger.error(error);
                    }
                }

                // Check for 2FA code
                try {
                    logger.info("Checking for 2FA verification...");
                    await this.page.waitForXPath('//*[contains(text(), "Enter the code found in your authenticator app")]');
                    logger.info("2FA verification found.");

                    // Prompt user for code
                    const result: any = await asyncPrompt(["code"]);
                    const code = result["code"];

                    // Enter code
                    const first_input = await this.page.waitForXPath('(//input[@type="text"])');
                    if (first_input === null) {
                        logger.error("first_input was null!");
                        break
                    }
                    await ((first_input) as puppeteer.ElementHandle<Element>).click();
                    await this.page.keyboard.type(code);

                    // Click submit
                    const button = await this.page.waitForXPath('//button[@target="submit_button"]');
                    if (button == null) {
                        logger.error("button was null!");
                        break
                    }
                    await ((button) as puppeteer.ElementHandle<Element>).click();

                    break;
                } catch (error) {
                    if (error instanceof TimeoutError) {
                        logger.info("2FA verification not found.");
                    } else {
                        logger.error(error);
                    }
                }

                logger.info("No extra verification found!");

                break;
            }

            // Wait for redirect to main Twitch page. If this times out then there is probably a different type of verification that we haven't checked for.
            try {
                await waitForCookies(timeout);
            } catch (error) {
                if (error instanceof TimeoutError) {
                    const time = new Date().getTime();
                    const screenshotPath = "failed-login-screenshot-" + time + ".png";
                    const htmlPath = "failed-login-html-" + time + ".html";
                    logger.error("Failed to login. There was probably an extra verification step that this app didn't check for."
                        + " A screenshot of the page will be saved to " + screenshotPath + ".");
                    await this.page.screenshot({
                        fullPage: true,
                        path: screenshotPath
                    });
                    fs.writeFileSync(htmlPath, await this.page.content());
                }
                throw error;
            }

        } else {
            await waitForCookies(0);
        }

        const cookies = await this.page.cookies();

        this.page.off("close", onPageClosed);
        await this.page.close();

        return cookies;
    }

}
