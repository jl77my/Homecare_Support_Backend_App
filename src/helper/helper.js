const formatMySQLDate = (date) => {
    return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
};

const getCurrentMalaysiaMySQLDate = () => {
    const malaysiaOffsetMs = 8 * 60 * 60 * 1000; // UTC+8
    return new Date(Date.now() + malaysiaOffsetMs)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
};

module.exports = { formatMySQLDate, getCurrentMalaysiaMySQLDate };