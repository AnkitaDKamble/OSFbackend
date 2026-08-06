import axios from 'axios';

/**
 * Sends an OTP to a mobile number using the MSG91 Flow API.
 * @param {string} mobile The 10-digit mobile number to send the OTP to.
 * @param {string} otp The generated OTP code to be sent.
 * @returns {Promise<boolean>} A promise that resolves to true on success, false on failure.
 */
export const sendOTP = async (mobile, otp) => {
    // Log the original OTP for debugging purposes, as requested.
    console.log('Original OTP to be sent:', otp);
    
    // NOTE: Hardcoded for development purposes as requested.
    // For production, it is highly recommended to use environment variables.
    const flowId = '68b4571bc64221217b67be66'; 
    const authKey = '466937A0rDCLENHh68cbc330P1';

    const url = 'https://control.msg91.com/api/v5/flow/';

    const data = {
        flow_id: flowId,
        sender: 'OSF APP',
        mobiles: `91${mobile}`,
        OTP: otp,
    };

    try {
        const response = await axios.post(url, data, {
            headers: {
                'authkey': authKey,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.type === 'success') {
            console.log('OTP sent successfully:', response.data.message);
            return true;
        } else {
            console.error('MSG91 API Error:', response.data.message);
            return false;
        }

    } catch (error) {
        console.error('Error sending OTP:', error.response?.data || error.message);
        return false;
    }
};
