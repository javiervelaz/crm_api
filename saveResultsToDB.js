const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/whatsapp-bot', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const businessSchema = new mongoose.Schema({
    name: String,
    address: String,
    phone: String,
    email: String,
    city: String
});

const Business = mongoose.model('Business', businessSchema);

async function saveResultsToDB(results, city) {
    results.forEach(result => {
        const business = new Business({
            ...result,
            city
        });
        business.save();
    });
}
