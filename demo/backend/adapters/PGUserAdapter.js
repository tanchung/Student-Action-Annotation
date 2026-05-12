/**
 * PostgreSQL User Adapter
 * Replaces Mongoose User model with direct PostgreSQL queries
 * Provides the same interface as Mongoose model
 */

const pgPool = require('../config/postgres');
const bcrypt = require('bcryptjs');

class PGUserAdapter {
  static mapRow(row) {
    if (!row) return null;

    return {
      ...row,
      dateOfBirth: row.dateofbirth ?? row.dateOfBirth ?? null,
      nonLocked: row.nonlocked ?? row.nonLocked ?? true,
      isEnabled: row.isenabled ?? row.isEnabled ?? true,
      createdAt: row.createdat ?? row.createdAt ?? null,
    };
  }

  /**
   * Find user by username
   * @returns {Object} User object or null
   */
  static async findOne(filter) {
    try {
      const clauses = [];
      const values = [];
      let paramCount = 1;

      if (filter.username) {
        clauses.push(`username = $${paramCount}`);
        values.push(filter.username);
        paramCount++;
      }
      if (filter.email) {
        clauses.push(`email = $${paramCount}`);
        values.push(filter.email);
        paramCount++;
      }
      if (filter.id || filter._id) {
        clauses.push(`id = $${paramCount}`);
        values.push(filter.id || filter._id);
        paramCount++;
      }

      const query = `SELECT * FROM users${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} LIMIT 1`;
      const result = await pgPool.query(query, values);
      return this.mapRow(result.rows[0]);
    } catch (err) {
      console.error('PGUserAdapter.findOne error:', err.message);
      throw err;
    }
  }

  /**
   * Find user by ID
   */
  static async findById(id) {
    try {
      const result = await pgPool.query(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );
      return this.mapRow(result.rows[0]);
    } catch (err) {
      console.error('PGUserAdapter.findById error:', err.message);
      throw err;
    }
  }

  /**
   * Find users with filtering, sorting, pagination
   */
  static async find(filter = {}, options = {}) {
    try {
      const whereParts = [];
      const values = [];
      let paramCount = 1;

      // Build WHERE clause
      if (filter.$or) {
        const conditions = filter.$or.map((condition) => {
          if (condition.username) {
            values.push(`%${condition.username.$regex}%`);
            return `username ILIKE $${paramCount++}`;
          }
          if (condition.email) {
            values.push(`%${condition.email.$regex}%`);
            return `email ILIKE $${paramCount++}`;
          }
          if (condition.full_name) {
            values.push(`%${condition.full_name.$regex}%`);
            return `full_name ILIKE $${paramCount++}`;
          }
          return null;
        }).filter(Boolean);
        
        if (conditions.length > 0) {
          whereParts.push('(' + conditions.join(' OR ') + ')');
        }
      }

      if (filter.role && filter.role !== 'all') {
        values.push(filter.role);
        whereParts.push(`role = $${paramCount++}`);
      }

      // Sorting
      const sortFieldMap = {
        createdAt: 'createdat',
        dateOfBirth: 'dateofbirth',
        nonLocked: 'nonlocked',
        isEnabled: 'isenabled',
      };
      const sortField = sortFieldMap[options.sortBy] || 'createdat';
      const sortDir = options.sortDir === 'asc' ? 'ASC' : 'DESC';
      const limit = parseInt(options.limit) || 10;
      const skip = ((parseInt(options.page) || 1) - 1) * limit;

      const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      let query = `SELECT * FROM users ${whereClause} ORDER BY ${sortField} ${sortDir} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit, skip);

      const result = await pgPool.query(query, values);
      return result.rows.map((row) => this.mapRow(row));
    } catch (err) {
      console.error('PGUserAdapter.find error:', err.message);
      throw err;
    }
  }

  /**
   * Count documents matching filter
   */
  static async countDocuments(filter = {}) {
    try {
      const whereParts = [];
      const values = [];
      let paramCount = 1;

      if (filter.$or) {
        const conditions = filter.$or.map((condition) => {
          if (condition.username) {
            values.push(`%${condition.username.$regex}%`);
            return `username ILIKE $${paramCount++}`;
          }
          if (condition.email) {
            values.push(`%${condition.email.$regex}%`);
            return `email ILIKE $${paramCount++}`;
          }
          if (condition.full_name) {
            values.push(`%${condition.full_name.$regex}%`);
            return `full_name ILIKE $${paramCount++}`;
          }
          return null;
        }).filter(Boolean);

        if (conditions.length > 0) {
          whereParts.push('(' + conditions.join(' OR ') + ')');
        }
      }

      if (filter.role && filter.role !== 'all') {
        values.push(filter.role);
        whereParts.push(`role = $${paramCount++}`);
      }

      const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      const result = await pgPool.query(`SELECT COUNT(*) as count FROM users ${whereClause}`, values);
      return parseInt(result.rows[0].count);
    } catch (err) {
      console.error('PGUserAdapter.countDocuments error:', err.message);
      throw err;
    }
  }

  /**
   * Create new user
   */
  static async create(userData) {
    try {
      // Hash password if provided
      let hashedPassword = userData.password;
      if (userData.password) {
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(userData.password, salt);
      }

      const {
        id,
        username,
        email,
        full_name,
        role = 'user',
        dateOfBirth,
        nonLocked = true,
        isEnabled = true
      } = userData;

      const query = `
        INSERT INTO users (id, username, password, role, full_name, email, dateOfBirth, nonLocked, isEnabled, createdAt)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `;

      const result = await pgPool.query(query, [
        id,
        username,
        hashedPassword,
        role,
        full_name || null,
        email,
        dateOfBirth || null,
        nonLocked,
        isEnabled
      ]);

      return this.mapRow(result.rows[0]);
    } catch (err) {
      console.error('PGUserAdapter.create error:', err.message);
      throw err;
    }
  }

  /**
   * Update user by ID
   */
  static async findByIdAndUpdate(id, updateData) {
    try {
      const fields = [];
      const values = [id];
      let paramCount = 2;

      // Don't allow updating password, username, id via this method
      const { password, username, _id, id: idField, ...safeData } = updateData;

      for (const [key, value] of Object.entries(safeData)) {
        fields.push(`"${key}" = $${paramCount}`);
        values.push(value);
        paramCount++;
      }

      if (fields.length === 0) {
        // No fields to update, return current user
        return await this.findById(id);
      }

      const query = `
        UPDATE users 
        SET ${fields.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const result = await pgPool.query(query, values);
      return this.mapRow(result.rows[0]);
    } catch (err) {
      console.error('PGUserAdapter.findByIdAndUpdate error:', err.message);
      throw err;
    }
  }

  /**
   * Delete user by ID
   */
  static async findByIdAndDelete(id) {
    try {
      const result = await pgPool.query(
        'DELETE FROM users WHERE id = $1 RETURNING *',
        [id]
      );
      return this.mapRow(result.rows[0]);
    } catch (err) {
      console.error('PGUserAdapter.findByIdAndDelete error:', err.message);
      throw err;
    }
  }

  /**
   * Compare password
   * Static method that takes hash and candidate password
   */
  static async comparePassword(hashPassword, candidatePassword) {
    try {
      return await bcrypt.compare(candidatePassword, hashPassword);
    } catch (err) {
      console.error('PGUserAdapter.comparePassword error:', err.message);
      throw err;
    }
  }

  /**
   * Instance-like method for comparison during migration period
   * When migrating, create user object with this method
   */
  static createUserInstance(userData) {
    return {
      ...userData,
      comparePassword: async function(candidatePassword) {
        return await PGUserAdapter.comparePassword(this.password, candidatePassword);
      },
      select: function(fields) {
        const selected = { ...this };
        if (fields && fields.startsWith('-')) {
          // Negative fields (exclude)
          const excludeFields = fields.split(' ').filter(f => f);
          excludeFields.forEach(f => {
            const fieldName = f.startsWith('-') ? f.substring(1) : f;
            delete selected[fieldName];
          });
        }
        return selected;
      }
    };
  }
}

module.exports = PGUserAdapter;
