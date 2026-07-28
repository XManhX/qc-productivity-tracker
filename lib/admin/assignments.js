import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    const { method, query, body } = req;

    switch (method) {
        case 'GET':
            return getAssignments(req, res);
        case 'POST':
            return createAssignment(req, res);
        case 'PUT':
            return updateAssignment(req, res);
        case 'DELETE':
            return deleteAssignment(req, res);
        default:
            res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
            return res.status(405).json({ error: `Method ${method} not allowed` });
    }
}

async function getAssignments(req, res) {
    try {
        const { date, email } = req.query;
        let query = supabase.from('qc_work_assignments').select('*');

        if (date) {
            // Lấy assignments trong ngày date (theo múi giờ VN)
            const start = `${date}T00:00:00+07:00`;
            const end = `${date}T23:59:59+07:00`;
            query = query.gte('end_time', start).lte('start_time', end);
        }
        if (email) {
            query = query.eq('user_email', email);
        }
        query = query.order('start_time', { ascending: true });

        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json({ success: true, data });
    } catch (err) {
        console.error('Lỗi get assignments:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function createAssignment(req, res) {
    try {
        const { user_email, start_time, end_time, reason } = req.body;

        // Kiểm tra bắt buộc
        if (!user_email || !start_time || !end_time) {
            return res.status(400).json({ success: false, error: 'Thiếu thông tin: user_email, start_time, end_time' });
        }

        // Kiểm tra user tồn tại và is_active
        const { data: user, error: userError } = await supabase
            .from('qc_users')
            .select('email, is_active')
            .eq('email', user_email)
            .single();

        if (userError || !user) {
            return res.status(404).json({ success: false, error: 'Không tìm thấy user' });
        }
        if (!user.is_active) {
            return res.status(400).json({ success: false, error: 'User không còn active' });
        }

        // Validate thời gian
        const start = new Date(start_time).getTime();
        const end = new Date(end_time).getTime();
        if (isNaN(start) || isNaN(end) || end <= start) {
            return res.status(400).json({ success: false, error: 'Thời gian không hợp lệ' });
        }

        const { data, error } = await supabase
            .from('qc_work_assignments')
            .insert({
                user_email,
                start_time,
                end_time,
                reason: reason || '',
                created_by: req.user?.email || 'admin', // nếu có thông tin user từ token
            })
            .select()
            .single();

        if (error) throw error;
        return res.status(201).json({ success: true, data });
    } catch (err) {
        console.error('Lỗi tạo assignment:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function updateAssignment(req, res) {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ success: false, error: 'Thiếu id' });

        const { user_email, start_time, end_time, reason } = req.body;
        const updateData = {};
        if (user_email) updateData.user_email = user_email;
        if (start_time) updateData.start_time = start_time;
        if (end_time) updateData.end_time = end_time;
        if (reason !== undefined) updateData.reason = reason;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, error: 'Không có dữ liệu cập nhật' });
        }

        const { data, error } = await supabase
            .from('qc_work_assignments')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return res.status(200).json({ success: true, data });
    } catch (err) {
        console.error('Lỗi cập nhật assignment:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

async function deleteAssignment(req, res) {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ success: false, error: 'Thiếu id' });

        const { error } = await supabase.from('qc_work_assignments').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true, message: 'Đã xoá' });
    } catch (err) {
        console.error('Lỗi xoá assignment:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}