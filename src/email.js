let config = require('../config');
const tool = require('./tools');
const nodemailer = require('nodemailer');

let sendEmail = function(subject, text){
    return new Promise(async function (resolve) {
        if(config.mail.active){
            let mailOptions = config.mail.options;
            mailOptions.subject = subject;
            mailOptions.text = text;

            let transporter = nodemailer.createTransport(config.mail.setting);

            transporter.verify(async function(error, success) {
                if (error) {
                    console.log(error);
                } else {
                    transporter.sendMail(mailOptions, function(error, info){
                        if (error) {
                            console.log(error);
                        } else {
                            console.log('Email sent: ' + info.response);
                        }
                    });
                }
                await tool.sleep(10000);
                resolve(true);
            });
        } else {
            console.error("Email deactivated!");
            resolve(false);
        }
    });

};

module.exports = {
    sendEmail: sendEmail
};