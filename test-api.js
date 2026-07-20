const qrcode = require('qrcode-terminal');

async function testCreateOrder() {
    const url = 'http://localhost:3001/api/create-order';
    
    // User token from database (Admin user we seeded)
    const token = '3b5a65c28184fb285ab2751307c8908c';
    const orderid = Math.floor(Math.random() * (999999999 - 123456789 + 1) + 123456789).toString();

    const data = new URLSearchParams({
        'customer_mobile': '1234567890',
        'user_token': token,
        'amount': '1.00',
        'order_id': orderid,
        'redirect_url': 'http://localhost:3001/success',
        'remark1': 'Test Order',
        'remark2': 'Test Order Remark'
    });

    console.log(`Sending create-order request for Order ID: ${orderid}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: data,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const text = await response.text();
        try {
            const json = JSON.parse(text);

            if (json.status) {
                console.log(`\n✅ Order created successfully!`);
                console.log(`🔗 Payment Web Page URL: ${json.result.payment_url}`);
                
                // Fetch the payment URL to trigger session creation and get the UPI deep link
                const payReq = await fetch(json.result.payment_url, { redirect: 'follow' });
                const payHtml = await payReq.text();
                
                // Extract UPI ID string from the HTML (qr_url)
                const match = payHtml.match(/data=(upi%3A%2F%2Fpay[^"]+)/);
                if (match && match[1]) {
                    const upiString = decodeURIComponent(match[1]);
                    console.log(`\n📱 Scan the QR code below using GPay/PhonePe to pay directly (No browser needed!):`);
                    qrcode.generate(upiString, { small: true });
                } else {
                    console.log("\n⚠️ Could not extract UPI QR code. Please click the link above in your browser.");
                }

                // Now poll check-order every 10 seconds for 5 minutes
                await pollCheckOrder(token, orderid);
            } else {
                console.error(`\n❌ Failed to create order:`, json.message);
            }
        } catch (e) {
            console.error('Failed to parse JSON. Raw response:', text);
        }

    } catch (error) {
        console.error('Error during request:', error.message);
    }
}

async function pollCheckOrder(token, orderid) {
    // We must poll /payment4/status.php because this route triggers the backend to check BharatPe API
    const url = 'http://localhost:3001/payment4/status.php';
    const data = JSON.stringify({ order_id: orderid });

    console.log(`\n⏳ Polling payment status every 10 seconds (for up to 5 minutes)...`);
    
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes (30 * 10 seconds)

    const pollInterval = setInterval(async () => {
        attempts++;
        try {
            const response = await fetch(url, {
                method: 'POST',
                body: data,
                headers: { 'Content-Type': 'application/json' }
            });
            const json = await response.json();

            if (json.status === 'SUCCESS') {
                console.log(`\n🎉 Payment Successful for Order ID: ${orderid}! UTR Captured.`);
                clearInterval(pollInterval);
            } else if (json.status === 'FAILURE' || json.status === 'ERROR') {
                console.log(`\n❌ Payment Failed / Expired for Order ID: ${orderid}.`);
                clearInterval(pollInterval);
            } else {
                process.stdout.write(`.`);
                if (attempts % 6 === 0) {
                    console.log(` [${attempts * 10} seconds elapsed]`);
                }
            }

            if (attempts >= maxAttempts && json.status === 'PENDING') {
                console.log(`\n⏰ 5 minutes passed. Polling timed out.`);
                clearInterval(pollInterval);
            }

        } catch (error) {
            console.error('\nError checking order:', error.message);
        }
    }, 10000);
}

// Run the test
testCreateOrder();
