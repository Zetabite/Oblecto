import path from 'path';
import fs from 'fs';
import sequelize from 'sequelize';

import databases from '../../../submodules/database';
import authMiddleWare from '../middleware/auth';
import errors from 'restify-errors';
import jimp from 'jimp';

const Op = sequelize.Op;

export default (server, oblecto) => {

    server.get('/series/list/:sorting', authMiddleWare.requiresAuth, async function (req, res, next) {
        let limit = 20;
        let page = 0;

        let AllowedOrders = ['desc', 'asc'];

        if (AllowedOrders.indexOf(req.query.order.toLowerCase()) === -1)
            return next(new errors.BadRequestError('Sorting order is invalid'));

        if (!(req.params.sorting in databases.tvshow.rawAttributes))
            return next(new errors.BadRequestError('Sorting method is invalid'));

        if (req.query.count)
            limit = parseInt(req.query.count);

        if (req.params.page && Number.isInteger(req.params.page))
            page = parseInt(req.query.page);

        let results = await databases.tvshow.findAll({
            order: [
                [req.params.sorting, req.query.order]
            ],
            limit,
            offset: limit * page
        });

        res.send(results);
    });

    // Endpoint to request info based on the local series ID
    server.get('/series/:id/info', authMiddleWare.requiresAuth, async function (req, res, next) {
        let show = await databases.tvshow.findByPk(req.params.id);

        if (show.genre)
            show.genre = JSON.parse(show.genre);

        res.send(show);
    });


    // Endpoint to get all episodes within a series
    server.get('/series/:id/episodes', authMiddleWare.requiresAuth, function (req, res, next) {
        // search for attributes
        databases.episode.findAll({
            include: [
                databases.tvshow,
                {
                    model: databases.trackEpisodes,
                    required: false,
                    where: {
                        userId: req.authorization.user.id
                    }
                }
            ],
            where: {tvshowId: req.params.id},
            order: [
                ['airedSeason', 'ASC'],
                ['airedEpisodeNumber', 'ASC']
            ],
        }).then(show => {
            res.send(show);
        });
    });

    // Endpoint to get the poster for a series
    server.get('/series/:id/poster', function (req, res, next) {
        databases.tvshow.findByPk(req.params.id).then(show => {
            if (!show) {
                return next(new errors.NotFoundError('No poster found'));
            }

            let posterPath = oblecto.artworkUtils.seriesPosterPath(show, 'medium');

            // Check if the poster image already exits
            fs.exists(posterPath, function (exists) {
                if (exists) {
                    // If the image exits, simply pipe it to the client
                    fs.createReadStream(posterPath).pipe(res);
                } else {
                    return next(new errors.NotFoundError('No poster found'));
                }
            });
        });
    });

    server.put('/series/:id/poster', async function (req, res, next) {
        let show = await databases.tvshow.findByPk(req.params.id);

        if (!show) {
            return next(new errors.NotFoundError('Movie does not exist'));
        }

        let posterPath = path.normalize(oblecto.config.assets.showPosterLocation) + '/' + show.id + '.jpg';

        if (oblecto.config.assets.storeWithFile) {
            let showPath = show.directory;
            posterPath = path.join(showPath, show.seriesName + '-poster.jpg');
        }

        if (req.files.length < 1) {
            return next(new errors.MissingParameter('Image file is missing'));
        }

        let uploadPath = req.files[Object.keys(req.files)[0]].path

        try {
            let image = await jimp.read(uploadPath);

            let ratio = image.bitmap.height / image.bitmap.width

            if ( !(1 <= ratio <= 2)) {
                return next(new errors.InvalidContent('Image aspect ratio is incorrect'));
            }

        } catch (e) {
            return next(new errors.InvalidContent('File is not an image'));
        }

        try {
            fs.copyFile(uploadPath, posterPath, (err) => {
                if (err) throw err;

                res.send(['success']);
            });
        } catch (e) {
            console.log(e);

            return next(new errors.Internal('An error has occured during upload of poster'));
        }

        next();
    });


    server.get('/shows/search/:name', authMiddleWare.requiresAuth, async function (req, res) {
        // search for attributes
        let tvshows = await databases.tvshow.findAll({
            where: {
                seriesName: {
                    [Op.like]: '%' + req.params.name + '%'
                }
            }
        });

        res.send(tvshows);

    });
};
